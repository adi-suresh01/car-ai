import { randomUUID } from "crypto";
import type {
  LaneDefinition,
  RoadScene,
  SimulationLayoutSummary,
  TrafficLaneProfile,
  TrafficBehaviorProfile,
  VehicleSnapshot,
  PlayerSnapshot,
  SimulationSnapshot,
  DrivingMissionSnapshot,
  DrivingMissionUpdate,
} from "../models/simulation";
import { logger } from "../utils/logger";

const buildLane = (
  index: number,
  type: LaneDefinition["type"],
  speedLimitMph: number,
  description: string,
) => ({
  id: `${type}-${index}`,
  index,
  type,
  speedLimitMph,
  description,
}) as LaneDefinition;

const coastal101Scene: RoadScene = {
  id: "california-101",
  name: "California US-101 Southbound",
  sceneryTheme: "urban" as const,
  ambientLight: 0.65,
  skyColor: "#87A6FF",
  lanes: [
    buildLane(0, "express", 65, "Express lane with movable barrier"),
    buildLane(1, "carpool", 65, "High-occupancy vehicle lane"),
    buildLane(2, "general", 60, "General traffic lane"),
    buildLane(3, "general", 60, "Middle lane with moderate flow"),
    buildLane(4, "general", 55, "Right lane near exits"),
  ],
  exits: [
    {
      id: "marsh-road",
      name: "Marsh Road",
      mileMarker: 404.5,
      connectsTo: "Menlo Park / Atherton",
    },
    {
      id: "whipple-avenue",
      name: "Whipple Ave",
      mileMarker: 409.2,
      connectsTo: "Redwood City Downtown",
    },
  ],
};

const coastalHighwayScene: RoadScene = {
  id: "california-1",
  name: "California Highway 1 Northbound",
  sceneryTheme: "coastal" as const,
  ambientLight: 0.8,
  skyColor: "#6EC6FF",
  lanes: [
    buildLane(0, "general", 55, "Scenic overlook passing lane"),
    buildLane(1, "general", 50, "Standard travel lane"),
    buildLane(2, "general", 50, "Right lane hugging the cliffs"),
    buildLane(3, "exit", 35, "Turnout lane for vista points"),
    buildLane(4, "exit", 25, "Emergency shoulder"),
  ],
  exits: [
    {
      id: "bixby-bridge",
      name: "Bixby Creek Bridge",
      mileMarker: 493.7,
      connectsTo: "Vista Point / Parking",
    },
    {
      id: "pfeiffer-beach",
      name: "Pfeiffer Beach",
      mileMarker: 585.1,
      connectsTo: "Beach Access Road",
    },
  ],
};

const scenes: ReadonlyArray<RoadScene> = [coastal101Scene, coastalHighwayScene];

const LANE_TYPE_PROFILES: Record<
  LaneDefinition["type"],
  {
    targetSpeedRange: [number, number];
    densityVehiclesPerMile: number;
    preferredSpacingMeters: number;
  }
> = {
  express: {
    targetSpeedRange: [66, 74],
    densityVehiclesPerMile: 18,
    preferredSpacingMeters: 45,
  },
  carpool: {
    targetSpeedRange: [60, 70],
    densityVehiclesPerMile: 20,
    preferredSpacingMeters: 38,
  },
  general: {
    targetSpeedRange: [50, 63],
    densityVehiclesPerMile: 28,
    preferredSpacingMeters: 32,
  },
  exit: {
    targetSpeedRange: [25, 40],
    densityVehiclesPerMile: 14,
    preferredSpacingMeters: 28,
  },
};

const VEHICLE_DIMENSIONS: Array<{
  type: VehicleSnapshot["type"];
  lengthMeters: number;
  widthMeters: number;
}> = [
  { type: "sedan", lengthMeters: 4.5, widthMeters: 1.8 },
  { type: "suv", lengthMeters: 4.9, widthMeters: 2 },
  { type: "truck", lengthMeters: 6.5, widthMeters: 2.5 },
  { type: "motorcycle", lengthMeters: 2.2, widthMeters: 0.8 },
];

const BEHAVIOR_PROFILES: TrafficBehaviorProfile[] = ["steady", "assertive", "cautious"];

const MPH_TO_MPS = 0.44704;
const DEFAULT_REFRESH_MS = 160;
const DESPAWN_DISTANCE_METERS = 2200;
const RESPAWN_OFFSET_METERS = -800;
const LANE_WIDTH_METERS = 3.6;

interface TrafficVehicleState {
  id: string;
  laneIndex: number;
  positionZ: number;
  speedMps: number;
  targetSpeedMps: number;
  type: VehicleSnapshot["type"];
  behavior: TrafficBehaviorProfile;
  lengthMeters: number;
  widthMeters: number;
}

const pickRandom = <T>(values: readonly T[]): T => {
  if (values.length === 0) {
    throw new Error("Cannot pick random value from an empty collection");
  }
  return values[Math.floor(Math.random() * values.length)] as T;
};

const mphToMps = (mph: number) => mph * MPH_TO_MPS;
const mpsToMph = (mps: number) => mps / MPH_TO_MPS;

export class SimulationService {
  private static instance: SimulationService;
  private readonly layout: SimulationLayoutSummary;
  private readonly laneProfiles: TrafficLaneProfile[];
  private readonly vehicles: TrafficVehicleState[] = [];
  private player: PlayerSnapshot;
  private mission: DrivingMissionSnapshot;
  private lastTick: number;
  private readonly timer: NodeJS.Timeout;

  static getInstance(): SimulationService {
    if (!SimulationService.instance) {
      SimulationService.instance = new SimulationService();
    }

    return SimulationService.instance;
  }

  private constructor() {
    const activeScene = scenes[0] ?? coastal101Scene;
    this.layout = {
      activeScene,
      scenes: [...scenes],
    };
    this.laneProfiles = this.buildLaneProfiles(activeScene);
    this.player = this.createInitialPlayer();
    this.mission = {
      targetLaneIndex: this.player.laneIndex,
      cruiseTargetSpeedMph: 65,
      cruiseGapMeters: 32,
      mode: "cruise",
      returnLaneIndex: null,
      laneChangeDirection: null,
      source: "system",
      updatedAt: Date.now(),
    };
    this.seedTraffic();
    this.lastTick = Date.now();
    this.timer = setInterval(() => {
      try {
        this.step();
      } catch (error) {
        logger.error("Simulation tick failed", { error });
      }
    }, DEFAULT_REFRESH_MS);
    this.timer.unref();
  }

  getLayoutSummary(): SimulationLayoutSummary {
    return this.layout;
  }

  getSnapshot(): SimulationSnapshot {
    return {
      timestamp: Date.now(),
      sceneId: this.layout.activeScene.id,
      lanes: this.laneProfiles,
      player: {
        ...this.player,
        position: [this.getLaneCenter(this.player.laneIndex), 0, this.player.position[2] ?? 0],
      },
      vehicles: this.vehicles.map((vehicle) => ({
        id: vehicle.id,
        laneIndex: vehicle.laneIndex,
        position: [this.getLaneCenter(vehicle.laneIndex), 0, vehicle.positionZ],
        speedMps: vehicle.speedMps,
        speedMph: mpsToMph(vehicle.speedMps),
        heading: [0, 0, 1],
        lengthMeters: vehicle.lengthMeters,
        widthMeters: vehicle.widthMeters,
        type: vehicle.type,
        behavior: vehicle.behavior,
      })),
      mission: { ...this.mission },
    };
  }

  resetTraffic() {
    this.vehicles.splice(0, this.vehicles.length);
    this.seedTraffic();
  }

  getPlayerState(): PlayerSnapshot {
    const position = this.player.position ?? [0, 0, 0];
    const heading = this.player.heading ?? [0, 0, 1];
    const [x = 0, y = 0, z = 0] = position;
    return {
      ...this.player,
      position: [x, y, z],
      heading: [...heading] as [number, number, number],
    };
  }

  getLaneCount(): number {
    return this.laneProfiles.length;
  }

  updatePlayerState(partial: Partial<PlayerSnapshot> & { positionZ?: number }) {
    const next: PlayerSnapshot = {
      ...this.player,
      ...partial,
    };

    if (partial.speedMps !== undefined) {
      next.speedMps = partial.speedMps;
      next.speedMph = mpsToMph(partial.speedMps);
    } else if (partial.speedMph !== undefined) {
      next.speedMph = partial.speedMph;
      next.speedMps = mphToMps(partial.speedMph);
    }

    if (partial.position !== undefined) {
      next.position = partial.position;
    }

    if (partial.positionZ !== undefined) {
      const [, y = 0] = next.position ?? [0, 0, 0];
      next.position = [this.getLaneCenter(next.laneIndex), y, partial.positionZ];
    }

    if (partial.laneIndex !== undefined) {
      const [, y = 0, z = 0] = next.position ?? [0, 0, 0];
      next.position = [this.getLaneCenter(partial.laneIndex), y, z];
    }

    this.player = {
      ...next,
      id: "player",
      type: "sedan",
      behavior: "steady",
    };
  }

  getMission(): DrivingMissionSnapshot {
    return { ...this.mission };
  }

  updateMission(update: DrivingMissionUpdate): DrivingMissionSnapshot {
    const next: DrivingMissionSnapshot = {
      ...this.mission,
      updatedAt: Date.now(),
    };

    if (update.targetLaneIndex !== undefined) {
      if (update.targetLaneIndex === null) {
        next.targetLaneIndex = null;
      } else if (
        Number.isInteger(update.targetLaneIndex) &&
        update.targetLaneIndex >= 0 &&
        update.targetLaneIndex < this.laneProfiles.length
      ) {
        next.targetLaneIndex = update.targetLaneIndex;
      } else {
        throw new Error(`Invalid lane index ${update.targetLaneIndex}`);
      }
    }

    if (update.cruiseTargetSpeedMph !== undefined) {
      const minSpeed = 25;
      const maxSpeed = 95;
      if (!Number.isFinite(update.cruiseTargetSpeedMph)) {
        throw new Error("Invalid cruiseTargetSpeedMph");
      }
      next.cruiseTargetSpeedMph = Math.max(
        minSpeed,
        Math.min(maxSpeed, update.cruiseTargetSpeedMph),
      );
    }

    if (update.cruiseGapMeters !== undefined) {
      if (!Number.isFinite(update.cruiseGapMeters) || update.cruiseGapMeters <= 0) {
        throw new Error("Invalid cruiseGapMeters");
      }
      const minGap = 8;
      const maxGap = 120;
      next.cruiseGapMeters = Math.max(minGap, Math.min(maxGap, update.cruiseGapMeters));
    }

    if (update.returnLaneIndex !== undefined) {
      if (update.returnLaneIndex === null) {
        next.returnLaneIndex = null;
      } else if (
        Number.isInteger(update.returnLaneIndex) &&
        update.returnLaneIndex >= 0 &&
        update.returnLaneIndex < this.laneProfiles.length
      ) {
        next.returnLaneIndex = update.returnLaneIndex;
      } else {
        throw new Error(`Invalid return lane index ${update.returnLaneIndex}`);
      }
    }

    if (update.mode !== undefined) {
      const validModes: DrivingMissionSnapshot["mode"][] = [
        "hold",
        "cruise",
        "lane_change",
        "overtake",
      ];
      if (!validModes.includes(update.mode)) {
        throw new Error(`Invalid mission mode ${update.mode}`);
      }
      next.mode = update.mode;
    }

    if (update.laneChangeDirection !== undefined) {
      const validDirections: Array<NonNullable<DrivingMissionSnapshot["laneChangeDirection"]>> = [
        "left",
        "right",
      ];
      if (update.laneChangeDirection !== null && !validDirections.includes(update.laneChangeDirection)) {
        throw new Error("laneChangeDirection must be 'left' or 'right' or null");
      }
      next.laneChangeDirection = update.laneChangeDirection ?? null;
    }

    if (update.source) {
      next.source = update.source;
    }

    if (update.note !== undefined) {
      next.note = update.note;
    }

    this.mission = next;
    logger.info("Mission updated", {
      mission: this.mission,
    });
    return this.getMission();
  }

  spawnVehicle(input: {
    laneIndex: number;
    speedMph?: number;
    positionZ?: number;
    type?: VehicleSnapshot["type"];
    behavior?: TrafficBehaviorProfile;
  }) {
    const laneProfile = this.laneProfiles[input.laneIndex];
    if (!laneProfile) {
      throw new Error(`Invalid lane index ${input.laneIndex}`);
    }

    const dims = pickRandom(VEHICLE_DIMENSIONS);
    const behavior = input.behavior ?? pickRandom(BEHAVIOR_PROFILES);
    const baseSpeedMph = this.randBetween(laneProfile.minSpeedMph, laneProfile.maxSpeedMph);
    const bias = this.randomBias(behavior);
    const targetSpeedMph = input.speedMph ?? baseSpeedMph * bias;
    const state: TrafficVehicleState = {
      id: randomUUID(),
      laneIndex: input.laneIndex,
      positionZ: input.positionZ ?? RESPAWN_OFFSET_METERS,
      speedMps: mphToMps(targetSpeedMph),
      targetSpeedMps: mphToMps(targetSpeedMph),
      type: input.type ?? dims.type,
      behavior,
      lengthMeters: dims.lengthMeters,
      widthMeters: dims.widthMeters,
    };

    this.vehicles.push(state);
    return state.id;
  }

  private buildLaneProfiles(scene: RoadScene): TrafficLaneProfile[] {
    return scene.lanes.map((lane) => {
      const profile = LANE_TYPE_PROFILES[lane.type];
      if (!profile) {
        throw new Error(`Missing lane profile for lane type ${lane.type}`);
      }
      const [minTarget, maxTarget] = profile.targetSpeedRange;
      const avgSpeed = (minTarget + maxTarget) / 2;
      const spawnRatePerMinute = Math.max(4, profile.densityVehiclesPerMile * 0.6);

      return {
        laneIndex: lane.index,
        type: lane.type,
        targetSpeedMph: avgSpeed,
        minSpeedMph: minTarget,
        maxSpeedMph: maxTarget,
        preferredSpacingMeters: profile.preferredSpacingMeters,
        spawnRatePerMinute,
      };
    });
  }

  private createInitialPlayer(): PlayerSnapshot {
    const dims = VEHICLE_DIMENSIONS[0] ?? { type: "sedan" as const, lengthMeters: 4.5, widthMeters: 1.9 };
    const speedMph = 58;
    const laneIndex = 0;
    return {
      id: "player",
      laneIndex,
      position: [this.getLaneCenter(laneIndex), 0, 0],
      speedMps: mphToMps(speedMph),
      speedMph,
      heading: [0, 0, 1],
      lengthMeters: dims.lengthMeters,
      widthMeters: dims.widthMeters,
      type: "sedan",
      behavior: "steady",
      steerAngleDeg: 0,
      accelerationMps2: 0,
    };
  }

  private seedTraffic() {
    const activeScene = this.layout.activeScene;
    activeScene.lanes.forEach((lane) => {
      const profile = this.laneProfiles[lane.index];
      if (!profile) {
        return;
      }
      const vehiclesPerKm = profile.spawnRatePerMinute / 60;
      const seedCount = Math.max(1, Math.round(vehiclesPerKm * 4));
      for (let i = 0; i < seedCount; i += 1) {
        const zPosition = this.randBetween(-400, 900);
        this.spawnVehicle({
          laneIndex: lane.index,
          speedMph: this.randBetween(profile.minSpeedMph, profile.maxSpeedMph),
          positionZ: zPosition,
          behavior: pickRandom(BEHAVIOR_PROFILES),
        });
      }
    });
  }

  private step() {
    const now = Date.now();
    const dt = Math.min(0.5, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (dt <= 0) return;

    const laneMap = new Map<number, TrafficVehicleState[]>();

    // Update speeds and positions
    this.vehicles.forEach((vehicle) => {
      const laneProfile = this.laneProfiles[vehicle.laneIndex];
      if (!laneProfile) {
        return;
      }
      const behaviorBias = this.randomBias(vehicle.behavior);
      const minSpeedMps = mphToMps(laneProfile.minSpeedMph) * behaviorBias;
      const maxSpeedMps = mphToMps(laneProfile.maxSpeedMph) * behaviorBias;

      const desiredSpeed = Math.max(
        minSpeedMps,
        Math.min(maxSpeedMps, vehicle.targetSpeedMps + this.randBetween(-1, 1) * 0.4),
      );
      vehicle.speedMps += (desiredSpeed - vehicle.speedMps) * Math.min(1, dt * 1.4);
      vehicle.speedMps = Math.max(minSpeedMps, Math.min(maxSpeedMps, vehicle.speedMps));
      vehicle.positionZ += vehicle.speedMps * dt;

      const laneVehicles = laneMap.get(vehicle.laneIndex) ?? [];
      laneVehicles.push(vehicle);
      laneMap.set(vehicle.laneIndex, laneVehicles);
    });

    this.handleLaneChanges(laneMap);

    // Apply spacing constraints per lane
    laneMap.forEach((laneVehicles, laneIndex) => {
      const profile = this.laneProfiles[laneIndex];
      if (!profile) {
        return;
      }
      laneVehicles.sort((a, b) => b.positionZ - a.positionZ);
      for (let i = 1; i < laneVehicles.length; i += 1) {
        const lead = laneVehicles[i - 1];
        const follower = laneVehicles[i];
        if (!lead || !follower) {
          continue;
        }
        const gap = lead.positionZ - follower.positionZ - lead.lengthMeters * 0.5 - follower.lengthMeters * 0.5;
        const minGap = profile.preferredSpacingMeters;
        if (gap < minGap) {
          follower.positionZ = lead.positionZ - (minGap + lead.lengthMeters * 0.5 + follower.lengthMeters * 0.5);
          follower.speedMps = Math.min(follower.speedMps, lead.speedMps * 0.9);
        }
      }
    });

    // Despawn vehicles that have left the simulation corridor
    for (let i = this.vehicles.length - 1; i >= 0; i -= 1) {
      const subject = this.vehicles[i];
      if (!subject) {
        continue;
      }
      if (subject.positionZ > DESPAWN_DISTANCE_METERS) {
        this.vehicles.splice(i, 1);
      }
      if (subject.positionZ < RESPAWN_OFFSET_METERS * 1.5) {
        this.vehicles.splice(i, 1);
      }
    }

    this.spawnNewVehicles(dt);
  }

  private spawnNewVehicles(dt: number) {
    this.laneProfiles.forEach((profile, laneIndex) => {
      if (!profile) return;
      const spawnProbability = (profile.spawnRatePerMinute / 60) * dt;
      if (Math.random() > spawnProbability) {
        return;
      }

      const laneVehicles = this.vehicles.filter((vehicle) => vehicle.laneIndex === laneIndex);
      const closestBehind = laneVehicles
        .filter((vehicle) => vehicle.positionZ < 0)
        .sort((a, b) => b.positionZ - a.positionZ)[0];

      if (closestBehind && Math.abs(closestBehind.positionZ - RESPAWN_OFFSET_METERS) < profile.preferredSpacingMeters) {
        return;
      }

      this.spawnVehicle({
        laneIndex,
        speedMph: this.randBetween(profile.minSpeedMph, profile.maxSpeedMph),
        positionZ: RESPAWN_OFFSET_METERS,
      });
    });
  }

  private handleLaneChanges(laneMap: Map<number, TrafficVehicleState[]>) {
    laneMap.forEach((vehicles) => {
      vehicles.sort((a, b) => a.positionZ - b.positionZ);
    });

    this.vehicles.forEach((vehicle) => {
      this.evaluateLaneChange(vehicle, laneMap);
    });
  }

  private evaluateLaneChange(vehicle: TrafficVehicleState, laneMap: Map<number, TrafficVehicleState[]>) {
    const currentLaneVehicles = laneMap.get(vehicle.laneIndex);
    const currentProfile = this.laneProfiles[vehicle.laneIndex];
    if (!currentLaneVehicles || !currentProfile) {
      return;
    }

    const { ahead } = this.findNeighbors(currentLaneVehicles, vehicle);
    const gapAhead = ahead
      ? ahead.positionZ - vehicle.positionZ - ahead.lengthMeters * 0.5 - vehicle.lengthMeters * 0.5
      : Number.POSITIVE_INFINITY;

    const maxLaneSpeedMps = mphToMps(currentProfile.maxSpeedMph);
    const comfortableGap = currentProfile.preferredSpacingMeters * 0.65;

    if (gapAhead > comfortableGap && vehicle.speedMps <= maxLaneSpeedMps * 0.98) {
      return;
    }

    const candidateLanes = [vehicle.laneIndex - 1, vehicle.laneIndex + 1].filter(
      (laneIndex) => laneIndex >= 0 && laneIndex < this.laneProfiles.length,
    );

    let chosenLane: number | undefined;
    let chosenScore = -Infinity;

    candidateLanes.forEach((laneIndex) => {
      const targetProfile = this.laneProfiles[laneIndex];
      if (!targetProfile) {
        return;
      }

      const laneVehicles = laneMap.get(laneIndex) ?? [];
      const neighbors = this.findNeighbors(laneVehicles, vehicle);

      const gapAheadTarget = neighbors.ahead
        ? neighbors.ahead.positionZ - vehicle.positionZ - neighbors.ahead.lengthMeters * 0.5 - vehicle.lengthMeters * 0.5
        : Number.POSITIVE_INFINITY;
      const gapBehindTarget = neighbors.behind
        ? vehicle.positionZ - neighbors.behind.positionZ - neighbors.behind.lengthMeters * 0.5 - vehicle.lengthMeters * 0.5
        : Number.POSITIVE_INFINITY;

      const minGap = targetProfile.preferredSpacingMeters * 0.85;

      if (gapAheadTarget < minGap || gapBehindTarget < minGap) {
        return;
      }

      const targetSpeedMps = mphToMps(targetProfile.targetSpeedMph);
      const currentSpeedMps = mphToMps(currentProfile.targetSpeedMph);
      const speedGain = targetSpeedMps - currentSpeedMps;
      const score = gapAheadTarget + speedGain * 12;

      if (score > chosenScore) {
        chosenScore = score;
        chosenLane = laneIndex;
      }
    });

    if (chosenLane === undefined) {
      return;
    }

    const sourceArray = laneMap.get(vehicle.laneIndex);
    if (!sourceArray) {
      return;
    }
    const idx = sourceArray.indexOf(vehicle);
    if (idx >= 0) {
      sourceArray.splice(idx, 1);
    }
    sourceArray.sort((a, b) => a.positionZ - b.positionZ);
    laneMap.set(vehicle.laneIndex, sourceArray);

    const targetProfile = this.laneProfiles[chosenLane];

    vehicle.laneIndex = chosenLane;
    vehicle.positionZ += this.randBetween(-3, 3);
    if (targetProfile) {
      vehicle.targetSpeedMps = mphToMps(targetProfile.targetSpeedMph);
    }

    const targetArray = laneMap.get(chosenLane) ?? [];
    targetArray.push(vehicle);
    targetArray.sort((a, b) => a.positionZ - b.positionZ);
    laneMap.set(chosenLane, targetArray);
    if (targetProfile) {
      const desiredMph = this.randBetween(targetProfile.minSpeedMph, targetProfile.maxSpeedMph);
      vehicle.targetSpeedMps = mphToMps(desiredMph);
    }
  }

  private findNeighbors(
    laneVehicles: TrafficVehicleState[],
    vehicle: TrafficVehicleState,
  ): { ahead?: TrafficVehicleState; behind?: TrafficVehicleState } {
    let ahead: TrafficVehicleState | undefined;
    let behind: TrafficVehicleState | undefined;

    for (const candidate of laneVehicles) {
      if (candidate === vehicle) {
        continue;
      }
      if (candidate.positionZ >= vehicle.positionZ) {
        if (!ahead || candidate.positionZ < ahead.positionZ) {
          ahead = candidate;
        }
      } else if (!behind || candidate.positionZ > behind.positionZ) {
        behind = candidate;
      }
    }

    const result: { ahead?: TrafficVehicleState; behind?: TrafficVehicleState } = {};
    if (ahead) {
      result.ahead = ahead;
    }
    if (behind) {
      result.behind = behind;
    }
    return result;
  }

  private randomBias(behavior: TrafficBehaviorProfile): number {
    switch (behavior) {
      case "assertive":
        return 1.08;
      case "cautious":
        return 0.92;
      default:
        return 1;
    }
  }

  private randBetween(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  private getLaneCenter(laneIndex: number): number {
    const laneCount = this.layout.activeScene.lanes.length;
    if (laneCount <= 0) return 0;
    const centerIndex = (laneCount - 1) / 2;
    return (laneIndex - centerIndex) * LANE_WIDTH_METERS;
  }
}
