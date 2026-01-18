import { randomUUID } from "crypto";
import type {
  DrivingAction,
  DrivingObservation,
  DrivingStepResult,
  RewardBreakdown,
  SimulationSnapshot,
  TrafficLaneProfile,
  VehicleSnapshot,
  DrivingMissionSnapshot,
  DrivingMissionMode,
  LaneChangeDirection,
} from "../models/simulation";
import { SimulationService } from "../services/simulationService";
import { createSeededRng, normalizeSeed } from "../utils/rng";
import { loadScenario, type ScenarioConfig } from "../utils/scenarioLoader";

const MPH_TO_MPS = 0.44704;
const LANE_WIDTH_METERS = 3.6;
const TRAFFIC_DESPAWN_Z = 1200;
const TRAFFIC_RESPAWN_Z = -320;
const TRAFFIC_RESPAWN_JITTER = 180;
const EGO_LENGTH_METERS = 4.5;
const EGO_WIDTH_METERS = 1.9;

const mphToMps = (mph: number) => mph * MPH_TO_MPS;
const mpsToMph = (mps: number) => mps / MPH_TO_MPS;

interface EnvironmentVehicle {
  id: string;
  laneIndex: number;
  positionZ: number;
  speedMps: number;
  lengthMeters: number;
  widthMeters: number;
  type: VehicleSnapshot["type"];
}

interface EgoState {
  laneIndex: number;
  laneOffset: number;
  speedMps: number;
  positionZ: number;
  headingRad: number;
  gear: number;
}

export interface DrivingMission {
  targetLaneIndex: number | null;
  cruiseTargetSpeedMps: number;
  cruiseGapMeters: number;
  mode: DrivingMissionMode;
  returnLaneIndex?: number | null;
  laneChangeDirection?: LaneChangeDirection | null;
}

export interface DrivingEnvConfig {
  timeStepSeconds?: number;
  maxEpisodeSeconds?: number;
  maxSpeedMps?: number;
  maxAccelMps2?: number;
  maxBrakeMps2?: number;
  coastDragMps2?: number;
  laneCount?: number;
  seed?: number;
  scenarioId?: string;
}

const DEFAULT_CONFIG: Required<DrivingEnvConfig> = {
  timeStepSeconds: 0.2,
  maxEpisodeSeconds: 180,
  maxSpeedMps: mphToMps(90),
  maxAccelMps2: 3.6,
  maxBrakeMps2: 6.5,
  coastDragMps2: 1.2,
  laneCount: 5,
  seed: 0,
};

const FALLBACK_LANE_PROFILE: TrafficLaneProfile = {
  laneIndex: 0,
  type: "general",
  targetSpeedMph: 60,
  minSpeedMph: 45,
  maxSpeedMph: 70,
  preferredSpacingMeters: 32,
  spawnRatePerMinute: 18,
};

export class DrivingEnvironment {
  private readonly config: Required<DrivingEnvConfig>;
  private readonly laneProfiles: TrafficLaneProfile[];
  private traffic: EnvironmentVehicle[] = [];
  private ego: EgoState;
  private elapsedSeconds = 0;
  private episodeId: string;
  private mission: DrivingMission;
  private rng: () => number;
  private seed: number;
  private scenario?: ScenarioConfig;
  private episodeIndex = 0;

  constructor(config: DrivingEnvConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scenario = config.scenarioId ? loadScenario(config.scenarioId) ?? undefined : undefined;
    const scenarioSeed = this.scenario?.seed;
    this.seed = normalizeSeed(scenarioSeed ?? config.seed);
    this.rng = createSeededRng(this.seed);
    const { lanes } = SimulationService.getInstance().getSnapshot();
    this.laneProfiles = lanes.map((lane) => ({ ...lane }));
    this.episodeId = randomUUID();
    this.ego = {
      laneIndex: Math.min(Math.floor(this.config.laneCount / 2), lanes.length - 1),
      laneOffset: 0,
      speedMps: mphToMps(55),
      positionZ: 0,
      headingRad: 0,
      gear: 3,
    };
    this.mission = this.loadMissionFromService() ?? {
      targetLaneIndex: this.ego.laneIndex,
      cruiseTargetSpeedMps: mphToMps(65),
      cruiseGapMeters: 36,
      mode: "cruise",
      returnLaneIndex: null,
    };
    if (this.scenario?.mission) {
      this.setMission({
        mode: this.scenario.mission.mode ?? this.mission.mode,
        cruiseTargetSpeedMps:
          this.scenario.mission.cruiseTargetSpeedMph !== undefined
            ? mphToMps(this.scenario.mission.cruiseTargetSpeedMph)
            : this.mission.cruiseTargetSpeedMps,
        cruiseGapMeters: this.scenario.mission.cruiseGapMeters ?? this.mission.cruiseGapMeters,
        targetLaneIndex:
          this.scenario.mission.targetLaneIndex !== undefined
            ? this.scenario.mission.targetLaneIndex
            : this.mission.targetLaneIndex,
      });
    }
    this.reset();
  }

  reset(goal?: Partial<DrivingMission>): { observation: DrivingObservation; snapshot: SimulationSnapshot } {
    this.episodeId = randomUUID();
    if (this.scenario?.seed !== undefined) {
      this.seed = normalizeSeed(this.scenario.seed + this.episodeIndex);
    } else {
      this.seed = normalizeSeed(this.seed + 1);
    }
    this.rng = createSeededRng(this.seed);
    this.episodeIndex += 1;
    const snapshot = SimulationService.getInstance().getSnapshot();
    this.traffic = snapshot.vehicles.map((vehicle) => ({
      id: vehicle.id,
      laneIndex: vehicle.laneIndex,
      positionZ: vehicle.position[2],
      speedMps: vehicle.speedMps,
      lengthMeters: vehicle.lengthMeters,
      widthMeters: vehicle.widthMeters,
      type: vehicle.type,
    }));
    this.ego = {
      laneIndex: snapshot.player.laneIndex,
      laneOffset: 0,
      speedMps: snapshot.player.speedMps,
      positionZ: snapshot.player.position[2],
      headingRad: 0,
      gear: 3,
    };
    this.elapsedSeconds = 0;
    const serviceMission = this.loadMissionFromService();
    if (serviceMission) {
      this.setMission(serviceMission);
    }
    if (this.scenario?.mission) {
      this.setMission({
        mode: this.scenario.mission.mode ?? this.mission.mode,
        cruiseTargetSpeedMps:
          this.scenario.mission.cruiseTargetSpeedMph !== undefined
            ? mphToMps(this.scenario.mission.cruiseTargetSpeedMph)
            : this.mission.cruiseTargetSpeedMps,
        cruiseGapMeters: this.scenario.mission.cruiseGapMeters ?? this.mission.cruiseGapMeters,
        targetLaneIndex:
          this.scenario.mission.targetLaneIndex !== undefined
            ? this.scenario.mission.targetLaneIndex
            : this.mission.targetLaneIndex,
      });
    }
    if (goal) {
      this.setMission(goal);
    } else if (this.mission.targetLaneIndex === null || this.mission.targetLaneIndex === undefined) {
      this.mission.targetLaneIndex = this.ego.laneIndex;
    }
    return {
      observation: this.buildObservation(),
      snapshot: this.buildSnapshot(),
    };
  }

  setMission(goal: Partial<DrivingMission>) {
    this.mission = {
      ...this.mission,
      ...goal,
      targetLaneIndex:
        goal.targetLaneIndex === undefined ? this.mission.targetLaneIndex : goal.targetLaneIndex,
    };
  }

  getMission(): DrivingMission {
    return { ...this.mission };
  }

  getTimeStepSeconds(): number {
    return this.config.timeStepSeconds;
  }

  getEpisodeId(): string {
    return this.episodeId;
  }

  private loadMissionFromService(): DrivingMission | null {
    const mission = SimulationService.getInstance().getMission();
    if (!mission) return null;
    return this.snapshotMissionToDrivingMission(mission);
  }

  private snapshotMissionToDrivingMission(snapshot: DrivingMissionSnapshot): DrivingMission {
    return {
      targetLaneIndex: snapshot.targetLaneIndex,
      cruiseTargetSpeedMps: mphToMps(snapshot.cruiseTargetSpeedMph),
      cruiseGapMeters: snapshot.cruiseGapMeters,
      mode: snapshot.mode,
      returnLaneIndex: snapshot.returnLaneIndex ?? null,
      laneChangeDirection: snapshot.laneChangeDirection ?? null,
    };
  }

  step(action: DrivingAction): DrivingStepResult {
    const dt = this.config.timeStepSeconds;
    const accelCommand = action.acceleration ?? 0;
    const brakeCommand = action.brake ?? 0;
    const requestedLane =
      action.requestedLaneIndex ?? this.mission.targetLaneIndex ?? this.ego.laneIndex;

    const throttleAccel = accelCommand * this.config.maxAccelMps2;
    const brakeDecel = brakeCommand * this.config.maxBrakeMps2;
    const coastDrag = this.config.coastDragMps2 * (accelCommand < 0.05 ? 1 : 0.4);
    const netAccel = throttleAccel - brakeDecel - coastDrag;

    this.ego.speedMps = Math.max(0, Math.min(this.config.maxSpeedMps, this.ego.speedMps + netAccel * dt));
    this.ego.positionZ += this.ego.speedMps * dt;

    const previousLaneIndex = this.ego.laneIndex;
    const laneDelta = requestedLane - this.ego.laneIndex;
    if (Math.abs(laneDelta) > 0.01) {
      const direction = Math.sign(laneDelta);
      this.ego.laneOffset += direction * dt * (LANE_WIDTH_METERS / 1.2);
      if (Math.abs(this.ego.laneOffset) >= LANE_WIDTH_METERS * 0.5) {
        this.ego.laneIndex = Math.max(
          0,
          Math.min(this.laneProfiles.length - 1, this.ego.laneIndex + direction),
        );
        this.ego.laneOffset = 0;
      }
    } else {
      this.ego.laneOffset *= 0.8;
    }

    this.updateTraffic(dt);
    const collision = this.detectCollision();

    this.elapsedSeconds += dt;

    const observation = this.buildObservation();
    const reward = this.computeReward(observation, collision, netAccel, laneDelta);
    const done = collision || this.elapsedSeconds >= this.config.maxEpisodeSeconds;
    const snapshot = this.buildSnapshot(collision);
    const laneChanged = this.ego.laneIndex !== previousLaneIndex ? 1 : 0;

    return {
      observation,
      reward,
      done,
      info: {
        collisions: collision ? 1 : 0,
        laneChanges: laneChanged,
        elapsedSeconds: this.elapsedSeconds,
        snapshot,
      },
    };
  }

  private updateTraffic(dt: number) {
    const laneTailZ = new Map<number, number>();
    this.traffic.forEach((vehicle) => {
      const current = laneTailZ.get(vehicle.laneIndex);
      if (current === undefined || vehicle.positionZ < current) {
        laneTailZ.set(vehicle.laneIndex, vehicle.positionZ);
      }
    });
    this.traffic = this.traffic.map((vehicle) => {
      const nextZ = vehicle.positionZ + vehicle.speedMps * dt;
      if (nextZ <= TRAFFIC_DESPAWN_Z) {
        return {
          ...vehicle,
          positionZ: nextZ,
        };
      }
      const jitter = this.rng() * TRAFFIC_RESPAWN_JITTER;
      const profile = this.laneProfiles[vehicle.laneIndex] ?? FALLBACK_LANE_PROFILE;
      const densityFactor = Math.min(1.6, Math.max(0.6, profile.spawnRatePerMinute / 20));
      const densityJitter = jitter * densityFactor;
      const tailZ = laneTailZ.get(vehicle.laneIndex) ?? TRAFFIC_RESPAWN_Z;
      const respawnZ = Math.min(
        TRAFFIC_RESPAWN_Z - densityJitter,
        tailZ - profile.preferredSpacingMeters - vehicle.lengthMeters * 0.5,
      );
      return {
        ...vehicle,
        positionZ: respawnZ,
      };
    });
  }

  private detectCollision(): boolean {
    const egoHalfLength = EGO_LENGTH_METERS * 0.5;
    const egoHalfWidth = EGO_WIDTH_METERS * 0.5;
    return this.traffic.some((vehicle) => {
      if (vehicle.laneIndex !== this.ego.laneIndex) return false;
      const longitudinalGap = Math.abs(vehicle.positionZ - this.ego.positionZ);
      if (longitudinalGap > egoHalfLength + vehicle.lengthMeters * 0.5 + 1.2) return false;
      const lateralGap = Math.abs(this.ego.laneOffset);
      return lateralGap < egoHalfWidth + vehicle.widthMeters * 0.5 + 0.2;
    });
  }

  private buildObservation(): DrivingObservation {
    const laneVehicles = (laneIndex: number) =>
      this.traffic.filter((vehicle) => vehicle.laneIndex === laneIndex).sort((a, b) => a.positionZ - b.positionZ);
    const currentLaneVehicles = laneVehicles(this.ego.laneIndex);
    const ahead = currentLaneVehicles.find((vehicle) => vehicle.positionZ > this.ego.positionZ);
    const behind = [...currentLaneVehicles].reverse().find((vehicle) => vehicle.positionZ < this.ego.positionZ);
    const leftLaneVehicles = laneVehicles(this.ego.laneIndex - 1);
    const rightLaneVehicles = laneVehicles(this.ego.laneIndex + 1);
    const leftAhead = leftLaneVehicles.find((vehicle) => vehicle.positionZ > this.ego.positionZ);
    const leftBehind = [...leftLaneVehicles].reverse().find((vehicle) => vehicle.positionZ < this.ego.positionZ);
    const rightAhead = rightLaneVehicles.find((vehicle) => vehicle.positionZ > this.ego.positionZ);
    const rightBehind = [...rightLaneVehicles].reverse().find((vehicle) => vehicle.positionZ < this.ego.positionZ);
    const laneProfile = this.laneProfiles[this.ego.laneIndex] ?? this.laneProfiles[0] ?? FALLBACK_LANE_PROFILE;

    const gapAhead = ahead ? ahead.positionZ - this.ego.positionZ - ahead.lengthMeters * 0.5 : 120;
    const gapBehind = behind ? this.ego.positionZ - behind.positionZ - behind.lengthMeters * 0.5 : 120;
    const leftGapAhead = leftAhead ? leftAhead.positionZ - this.ego.positionZ - leftAhead.lengthMeters * 0.5 : 120;
    const leftGapBehind = leftBehind ? this.ego.positionZ - leftBehind.positionZ - leftBehind.lengthMeters * 0.5 : 120;
    const rightGapAhead = rightAhead ? rightAhead.positionZ - this.ego.positionZ - rightAhead.lengthMeters * 0.5 : 120;
    const rightGapBehind = rightBehind ? this.ego.positionZ - rightBehind.positionZ - rightBehind.lengthMeters * 0.5 : 120;

    const observation: DrivingObservation = {
      laneIndex: this.ego.laneIndex,
      laneOffsetMeters: this.ego.laneOffset,
      speedMps: this.ego.speedMps,
      targetSpeedMps: mphToMps(laneProfile.targetSpeedMph),
      cruiseTargetSpeedMps: this.mission.cruiseTargetSpeedMps,
      cruiseGapMeters: this.mission.cruiseGapMeters,
      gapAheadMeters: gapAhead,
      gapBehindMeters: gapBehind,
      relativeSpeedAheadMps: ahead ? ahead.speedMps - this.ego.speedMps : 0,
      relativeSpeedBehindMps: behind ? behind.speedMps - this.ego.speedMps : 0,
      leftGapAheadMeters: leftGapAhead,
      leftGapBehindMeters: leftGapBehind,
      leftRelativeSpeedAheadMps: leftAhead ? leftAhead.speedMps - this.ego.speedMps : 0,
      leftRelativeSpeedBehindMps: leftBehind ? leftBehind.speedMps - this.ego.speedMps : 0,
      rightGapAheadMeters: rightGapAhead,
      rightGapBehindMeters: rightGapBehind,
      rightRelativeSpeedAheadMps: rightAhead ? rightAhead.speedMps - this.ego.speedMps : 0,
      rightRelativeSpeedBehindMps: rightBehind ? rightBehind.speedMps - this.ego.speedMps : 0,
      headingDeltaRad: this.ego.headingRad,
    };
    if (this.mission.targetLaneIndex !== null && this.mission.targetLaneIndex !== undefined) {
      observation.targetLaneIndex = this.mission.targetLaneIndex;
      observation.targetLaneOffsetMeters =
        (this.mission.targetLaneIndex - this.ego.laneIndex) * LANE_WIDTH_METERS - this.ego.laneOffset;
    }
    observation.missionMode = this.mission.mode;
    if (this.mission.returnLaneIndex !== undefined) {
      observation.returnLaneIndex = this.mission.returnLaneIndex;
    }
    return observation;
  }

  private computeReward(
    observation: DrivingObservation,
    collision: boolean,
    netAccel: number,
    laneDelta: number,
  ): RewardBreakdown {
    const progress = observation.speedMps * this.config.timeStepSeconds;
    const targetLane = this.mission.targetLaneIndex;
    const laneAlignment =
      targetLane === null || targetLane === undefined
        ? 0
        : -Math.abs(targetLane - observation.laneIndex) * 0.35;
    const laneKeeping = -Math.abs(observation.laneOffsetMeters) * 0.1 + laneAlignment;
    const comfort = -Math.abs(netAccel) * 0.05;
    const ruleCompliance =
      observation.speedMps <= observation.targetSpeedMps * 1.1 ? 0.2 : -0.4;
    const cruiseTarget = this.mission.cruiseTargetSpeedMps ?? observation.targetSpeedMps;
    const cruiseTracking = -Math.abs(observation.speedMps - cruiseTarget) * 0.04;
    const gapTarget = this.mission.cruiseGapMeters;
    let gapKeeping = 0;
    if (gapTarget && gapTarget > 0) {
      const gapError = gapTarget - observation.gapAheadMeters;
      gapKeeping = -Math.abs(gapError) * 0.01;
      if (observation.gapAheadMeters < gapTarget * 0.6) {
        gapKeeping -= 0.6;
      }
    }
    const targetLaneReached =
      this.mission.targetLaneIndex !== null &&
      this.mission.targetLaneIndex !== undefined &&
      observation.laneIndex === this.mission.targetLaneIndex &&
      Math.abs(observation.laneOffsetMeters) < 0.2;
    const laneTargetBonus = targetLaneReached ? 0.6 : 0;
    const collisionPenalty = collision ? -25 : 0;
    const laneDisciplinePenalty = Math.abs(laneDelta) > 0.5 ? -0.2 : 0;

    const total =
      progress +
      laneKeeping +
      comfort +
      ruleCompliance +
      cruiseTracking +
      gapKeeping +
      laneTargetBonus +
      collisionPenalty +
      laneDisciplinePenalty;

    return {
      progress,
      laneKeeping,
      comfort,
      ruleCompliance,
      cruiseTracking,
      gapKeeping,
      laneTargetBonus,
      collisionPenalty: collisionPenalty + laneDisciplinePenalty,
      total,
    };
  }

  private buildSnapshot(collision = false): SimulationSnapshot {
    return {
      timestamp: Date.now(),
      sceneId: SimulationService.getInstance().getLayoutSummary().activeScene.id,
      lanes: this.laneProfiles,
      player: {
        id: "rl-player",
        laneIndex: this.ego.laneIndex,
        position: [0, 0, this.ego.positionZ],
        speedMps: this.ego.speedMps,
        speedMph: mpsToMph(this.ego.speedMps),
        heading: [0, 0, 1],
        lengthMeters: 4.5,
        widthMeters: 1.9,
        type: "sedan",
        behavior: "steady",
        steerAngleDeg: this.ego.laneOffset * 4,
        accelerationMps2: 0,
      },
      vehicles: this.traffic.map((vehicle) => ({
        id: vehicle.id,
        laneIndex: vehicle.laneIndex,
        position: [0, 0, vehicle.positionZ],
        speedMps: vehicle.speedMps,
        speedMph: mpsToMph(vehicle.speedMps),
        heading: [0, 0, 1],
        lengthMeters: vehicle.lengthMeters,
        widthMeters: vehicle.widthMeters,
        type: vehicle.type,
        behavior: "steady",
      })),
      mission: this.buildMissionSnapshot(),
      collision,
    };
  }

  private buildMissionSnapshot(): DrivingMissionSnapshot {
    return {
      targetLaneIndex: this.mission.targetLaneIndex ?? null,
      cruiseTargetSpeedMph: mpsToMph(this.mission.cruiseTargetSpeedMps),
      cruiseGapMeters: this.mission.cruiseGapMeters,
      mode: this.mission.mode,
      returnLaneIndex: this.mission.returnLaneIndex ?? null,
      laneChangeDirection: this.mission.laneChangeDirection ?? null,
      source: "rl",
      updatedAt: Date.now(),
    };
  }
}

export const DEFAULT_DRIVING_ENV_CONFIG = DEFAULT_CONFIG;
