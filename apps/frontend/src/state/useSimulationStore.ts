import { create } from "zustand";
import type {
  DrivingMissionState,
  SimulationLayoutSummary,
  SimulationSnapshot,
  TrafficLaneProfile,
  VehicleState,
  VoiceStatus,
} from "../models/simulation";
import { simulationController } from "../controllers/simulationController";

const LANE_WIDTH_METERS = 3.6;
const MPH_TO_MPS = 0.44704;
const MAX_SPEED_MPH = 120;
const MAX_STEER_DEG = 38;
const BRAKE_RATE_MPH_PER_S = 90;
const COAST_DECEL_MPH_PER_S = 12;
const COAST_THRESHOLD = 0.05;
const SHIFT_UP_HYSTERESIS_MPH = 1.5;
const SHIFT_DOWN_HYSTERESIS_MPH = 2.5;

const GEAR_STAGES = [
  { gear: 1, upshift: 14, downshift: -Infinity, accelRate: 58 },
  { gear: 2, upshift: 28, downshift: 9, accelRate: 42 },
  { gear: 3, upshift: 45, downshift: 22, accelRate: 30 },
  { gear: 4, upshift: 65, downshift: 38, accelRate: 22 },
  { gear: 5, upshift: 90, downshift: 58, accelRate: 16 },
  { gear: 6, upshift: Number.POSITIVE_INFINITY, downshift: 72, accelRate: 12 },
] as const;

const MIN_THROTTLE_FOR_SHIFT = 0.18;
const mpsToMph = (mps: number) => mps / MPH_TO_MPS;
const mphToMps = (mph: number) => mph * MPH_TO_MPS;
const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const normalizeLaneCenters = (laneCenters: number[]): number[] => {
  if (!laneCenters || laneCenters.length === 0) {
    return [0];
  }
  return laneCenters.map((center) => (Number.isFinite(center) ? center : 0));
};

export const buildVehicleList = (
  player: PlayerDynamics,
  npcVehicles: VehicleState[],
  laneCenters: number[],
): VehicleState[] => {
  const normalizedCenters = normalizeLaneCenters(laneCenters);
  const laneCenter = Number.isFinite(player.laneCenter)
    ? player.laneCenter
    : normalizedCenters[player.laneIndex] ?? 0;
  const worldX = Number.isFinite(player.lateralOffset)
    ? player.lateralOffset
    : laneCenter;
  const playerVehicle: VehicleState = {
    id: "player",
    laneIndex: player.laneIndex,
    speedMph: player.speedMph,
    speedMps: player.speedMph * MPH_TO_MPS,
    position: [worldX, 0, player.positionZ],
    heading: [0, 0, 1],
  };

  const filteredNpcs = npcVehicles
    .map((vehicle) => {
      const speedMps = vehicle.speedMps ?? mphToMps(vehicle.speedMph ?? 0);
      const center = vehicle.position?.[0] ?? normalizedCenters[vehicle.laneIndex] ?? 0;
      const [, , z = 0] = vehicle.position ?? [];
      if (!Number.isFinite(center) || !Number.isFinite(z)) {
        return undefined;
      }
      return {
        ...vehicle,
        speedMps,
        speedMph: vehicle.speedMph ?? mpsToMph(speedMps),
        position: [center, 0, z] as [number, number, number],
        heading: vehicle.heading ?? [0, 0, 1],
      };
    })
    .filter(Boolean) as VehicleState[];

  return [playerVehicle, ...filteredNpcs];
};

const convertSnapshotVehicle = (vehicle: VehicleState, laneCenters: number[]): VehicleState => {
  const normalizedCenters = normalizeLaneCenters(laneCenters);
  const speedMps = vehicle.speedMps ?? mphToMps(vehicle.speedMph ?? 0);
  const baseX = vehicle.position?.[0];
  const center = Number.isFinite(baseX)
    ? (baseX as number)
    : normalizedCenters[vehicle.laneIndex] ?? 0;
  const [, , z = 0] = vehicle.position ?? [];
  return {
    ...vehicle,
    speedMps,
    speedMph: vehicle.speedMph ?? mpsToMph(speedMps),
    position: [center, 0, z] as [number, number, number],
    heading: vehicle.heading ?? [0, 0, 1],
  };
};

interface ControlInput {
  steering: number;
  throttle: number;
  brake: number;
}

export interface PlayerDynamics {
  laneIndex: number;
  lateralOffset: number;
  speedMph: number;
  targetSpeedMph: number;
  steerAngleDeg: number;
  headingRad: number;
  positionZ: number;
  laneCenter: number;
  gear: number;
}

interface SimulationStore {
  layout?: SimulationLayoutSummary;
  npcVehicles: VehicleState[];
  isLoading: boolean;
  error?: string;
  laneCenters: number[];
  laneProfiles: TrafficLaneProfile[];
  lastSyncTimestamp?: number;
  controlInput: ControlInput;
  player: PlayerDynamics;
  mission: DrivingMissionState;
  collision: boolean;
  voiceStatus?: VoiceStatus;
  loadLayout: () => Promise<void>;
  syncTraffic: () => Promise<void>;
  hydrateSnapshot: (snapshot: SimulationSnapshot) => void;
  updateControlInput: (input: ControlInput) => void;
  tick: (dt: number) => void;
  applyMission: (mission: DrivingMissionState) => void;
  updateMission: (input: MissionUpdateInput) => Promise<void>;
}

const defaultControlInput: ControlInput = { steering: 0, throttle: 0, brake: 0 };

const createInitialPlayer = (): PlayerDynamics => ({
  laneIndex: 0,
  lateralOffset: 0,
  speedMph: 0,
  targetSpeedMph: 0,
  steerAngleDeg: 0,
  headingRad: 0,
  positionZ: 0,
  laneCenter: 0,
  gear: 1,
});

const createDefaultMission = (): DrivingMissionState => ({
  targetLaneIndex: 0,
  cruiseTargetSpeedMph: 65,
  cruiseGapMeters: 32,
  mode: "cruise",
  returnLaneIndex: null,
  laneChangeDirection: null,
  source: "system",
  updatedAt: Date.now(),
});

interface MissionUpdateInput {
  speedMph?: number;
  gapMeters?: number;
  gapCars?: number;
  targetLane?: number | null;
  note?: string;
  source?: string;
  mode?: string;
  returnLane?: number | null;
  laneChangeDirection?: string;
}

const resolveGearForSpeed = (speedMph: number, currentGear: number) => {
  let gear = currentGear;
  const maxGear = GEAR_STAGES.length;
  while (gear < maxGear) {
    const stage = GEAR_STAGES[gear - 1];
    const threshold = stage.upshift === Number.POSITIVE_INFINITY ? MAX_SPEED_MPH : stage.upshift;
    if (speedMph > threshold - SHIFT_UP_HYSTERESIS_MPH) {
      gear += 1;
    } else {
      break;
    }
  }

  while (gear > 1) {
    const stage = GEAR_STAGES[gear - 1];
    const downshiftThreshold =
      stage.downshift === -Infinity ? 0 : stage.downshift - SHIFT_DOWN_HYSTERESIS_MPH;
    if (speedMph < downshiftThreshold) {
      gear -= 1;
    } else {
      break;
    }
  }

  return Math.max(1, Math.min(maxGear, gear));
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  layout: undefined,
  npcVehicles: [],
  isLoading: false,
  error: undefined,
  laneCenters: [],
  laneProfiles: [],
  controlInput: defaultControlInput,
  player: createInitialPlayer(),
  mission: createDefaultMission(),
  collision: false,
  voiceStatus: undefined,
  loadLayout: async () => {
    set({ isLoading: true, error: undefined });
    try {
      const layout = await simulationController.fetchLayout();
      const laneCenters = layout.activeScene.lanes.map((_, index, arr) => {
        const centerIndex = (arr.length - 1) / 2;
        return (index - centerIndex) * LANE_WIDTH_METERS;
      });
      const defaultLane = layout.activeScene.lanes.find((lane) => lane.type !== "exit") ?? layout.activeScene.lanes[0];
      const defaultLaneIndex = defaultLane.index;
      const lateralOffset = laneCenters[defaultLaneIndex] ?? 0;

      const initialSpeed = defaultLane.speedLimitMph ?? 55;

      const playerState: PlayerDynamics = {
        laneIndex: defaultLaneIndex,
        lateralOffset,
        speedMph: initialSpeed,
        targetSpeedMph: initialSpeed,
        steerAngleDeg: 0,
        headingRad: 0,
        positionZ: 0,
        laneCenter: laneCenters[defaultLaneIndex] ?? 0,
        gear: resolveGearForSpeed(initialSpeed, 1),
      };

      set({
        layout,
        laneCenters,
        laneProfiles: [],
        npcVehicles: [],
        player: playerState,
        controlInput: defaultControlInput,
        mission: createDefaultMission(),
        collision: false,
        voiceStatus: undefined,
        isLoading: false,
      });

      const snapshot = await simulationController.fetchSnapshot();
      get().hydrateSnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      set({ error: message, isLoading: false });
    }
  },
  syncTraffic: async () => {
    try {
      const snapshot = await simulationController.fetchSnapshot();
      get().hydrateSnapshot(snapshot);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to sync traffic snapshot", error);
    }
  },
  hydrateSnapshot: (snapshot: SimulationSnapshot) => {
    if (!snapshot || !snapshot.lanes || snapshot.lanes.length === 0) {
      return;
    }

    const fallbackLaneCenters = snapshot.lanes.map((_, index, arr) => {
      const centerIndex = (arr.length - 1) / 2;
      return (index - centerIndex) * LANE_WIDTH_METERS;
    });

    set((state) => {
      const laneCentersBase = state.laneCenters.length > 0 ? state.laneCenters : fallbackLaneCenters;
      const laneCenters = laneCentersBase.length > 0 ? laneCentersBase : [0];

      const npcVehicles = snapshot.vehicles
        .filter((vehicle) => vehicle.id !== "player")
        .map((vehicle) => convertSnapshotVehicle(vehicle, laneCenters));

      const collision = Boolean(snapshot.collision);
      const voiceStatus = snapshot.voiceStatus ?? state.voiceStatus;
      if (collision && !state.collision) {
        // eslint-disable-next-line no-console
        console.warn("Collision detected in simulation snapshot");
      }

      return {
        laneCenters,
        laneProfiles: snapshot.lanes,
        npcVehicles,
        player: {
          ...state.player,
          laneCenter: laneCenters[state.player.laneIndex] ?? state.player.laneCenter,
        },
        mission: snapshot.mission ?? state.mission ?? createDefaultMission(),
        collision,
        voiceStatus,
        lastSyncTimestamp: snapshot.timestamp,
      };
    });
  },
  updateControlInput: (input: ControlInput) => {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    set({
      controlInput: {
        steering: clamp(input.steering, -1, 1),
        throttle: clamp(input.throttle, 0, 1),
        brake: clamp(input.brake, 0, 1),
      },
    });
  },
  tick: (dt: number) => {
    const state = get();
    const { layout, laneCenters, controlInput, player, mission, collision } = state;
  if (!layout) return;

  const steering = controlInput.steering;
  let throttle = controlInput.throttle;
  let brake = controlInput.brake;

  const currentSpeed = player.speedMph;

  const manualCruiseCancel =
    mission.mode === "cruise" && (throttle > 0.05 || brake > 0.05);

  if (manualCruiseCancel) {
    set((currentState) => ({
      mission: {
        ...currentState.mission,
        mode: "hold",
        source: "manual",
        updatedAt: Date.now(),
      },
    }));
    void state
      .updateMission({ mode: "hold", speedMph: currentSpeed, source: "manual" })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Failed to cancel cruise mission", error);
      });
  }

  const cruiseActive = mission.mode === "cruise" && !manualCruiseCancel && !collision;
  if (cruiseActive) {
    const targetSpeed = mission.cruiseTargetSpeedMph ?? currentSpeed;
    const speedError = targetSpeed - currentSpeed;

    if (speedError > 0.4) {
      const autoThrottle = clampValue(speedError / 12, 0.12, 0.8);
      throttle = Math.max(throttle, autoThrottle);
      brake = 0;
    } else if (speedError < -0.6) {
      const autoBrake = clampValue(-speedError / 8, 0.1, 1);
      brake = Math.max(brake, autoBrake);
      throttle = Math.min(throttle, 0.05);
    } else {
      throttle = Math.max(throttle, 0.08);
    }
  }

  if (collision) {
    throttle = 0;
    brake = Math.max(brake, 1);
  }

  let gear = player.gear > 0 ? player.gear : resolveGearForSpeed(currentSpeed, 1);
  let gearStage = GEAR_STAGES[gear - 1] ?? GEAR_STAGES[0];

  const normalizedThrottle =
      throttle > 0 ? Math.min(1, Math.max(0, throttle)) : 0;

    let accelMphPerS = 0;

    if (normalizedThrottle > 0) {
      const usableThrottle =
        throttle <= COAST_THRESHOLD
          ? 0
          : Math.min(1, (throttle - COAST_THRESHOLD) / (1 - COAST_THRESHOLD));
      const spanBase =
        gearStage.upshift === Number.POSITIVE_INFINITY
          ? Math.max(12, MAX_SPEED_MPH - (gearStage.downshift === -Infinity ? 0 : gearStage.downshift))
          : Math.max(
              12,
              gearStage.upshift - (gearStage.downshift === -Infinity ? 0 : gearStage.downshift),
            );
      const headroom =
        gearStage.upshift === Number.POSITIVE_INFINITY
          ? Math.max(0, MAX_SPEED_MPH - currentSpeed)
          : Math.max(0, gearStage.upshift - currentSpeed);
      const headroomFactor = Math.max(0.2, Math.min(1, headroom / spanBase));
      accelMphPerS += usableThrottle * gearStage.accelRate * headroomFactor;
    } else {
      const coastFactor =
        throttle <= COAST_THRESHOLD
          ? 1 - throttle / Math.max(COAST_THRESHOLD, 0.0001)
          : 0;
      accelMphPerS -= COAST_DECEL_MPH_PER_S * Math.min(1, Math.max(0, coastFactor));
    }

    if (brake > 0) {
      accelMphPerS -= brake * BRAKE_RATE_MPH_PER_S;
    }

    let newSpeedMph = currentSpeed + accelMphPerS * dt;
    if (gearStage.upshift !== Number.POSITIVE_INFINITY) {
      newSpeedMph = Math.min(newSpeedMph, gearStage.upshift);
    }
    newSpeedMph = Math.max(0, Math.min(MAX_SPEED_MPH, newSpeedMph));

    const prospectiveGear = (() => {
      let nextGear = gear;
      // Upshift if we're beyond the threshold with meaningful throttle
      while (
        nextGear < GEAR_STAGES.length &&
        throttle > MIN_THROTTLE_FOR_SHIFT &&
        newSpeedMph > (GEAR_STAGES[nextGear - 1].upshift === Number.POSITIVE_INFINITY
          ? MAX_SPEED_MPH
          : GEAR_STAGES[nextGear - 1].upshift - SHIFT_UP_HYSTERESIS_MPH)
      ) {
        nextGear += 1;
      }

      // Downshift if we slow down below the band or if throttle is nearly zero
      while (
        nextGear > 1 &&
        newSpeedMph < (GEAR_STAGES[nextGear - 1].downshift === -Infinity
          ? 0
          : GEAR_STAGES[nextGear - 1].downshift - SHIFT_DOWN_HYSTERESIS_MPH)
      ) {
        nextGear -= 1;
      }

      return Math.max(1, Math.min(GEAR_STAGES.length, nextGear));
    })();

    gear = prospectiveGear;
    gearStage = GEAR_STAGES[gear - 1] ?? gearStage;

    const speedMps = newSpeedMph * MPH_TO_MPS;
    const steerAngleDeg = steering * MAX_STEER_DEG;
    const headingRad = steerAngleDeg * (Math.PI / 180) * 0.35;

    const lateralVelocity = steering * Math.min(1, newSpeedMph / 80) * 6;
    const newOffset = player.lateralOffset + lateralVelocity * dt;

    const halfRoadWidth = laneCenters.length > 0 ? (laneCenters.length - 1) / 2 : 0;
    const minOffset = -halfRoadWidth * LANE_WIDTH_METERS;
    const maxOffset = halfRoadWidth * LANE_WIDTH_METERS;
    const clampedOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));

    const positionZ = player.positionZ + speedMps * dt;

    let closestLaneIndex = player.laneIndex;
    if (laneCenters.length > 0) {
      let best = Number.POSITIVE_INFINITY;
      laneCenters.forEach((center, index) => {
        const distance = Math.abs(center - clampedOffset);
        if (distance < best) {
          best = distance;
          closestLaneIndex = index;
        }
      });
    }

    const recalculatedLaneCenters =
      state.laneCenters.length > 0
        ? state.laneCenters
        : state.laneProfiles.length > 0
          ? state.laneProfiles.map((_, index, arr) => {
              const centerIndex = (arr.length - 1) / 2;
              return (index - centerIndex) * LANE_WIDTH_METERS;
            })
          : [0];

    const updatedPlayer: PlayerDynamics = {
      laneIndex: closestLaneIndex,
      lateralOffset: clampedOffset,
      speedMph: newSpeedMph,
      targetSpeedMph: cruiseActive ? mission.cruiseTargetSpeedMph : newSpeedMph,
      steerAngleDeg,
      headingRad,
      positionZ,
      laneCenter: recalculatedLaneCenters[closestLaneIndex] ?? 0,
      gear,
    };

    const updatedNpcVehicles = state.npcVehicles.map((vehicle) => {
      const laneCenter = recalculatedLaneCenters[vehicle.laneIndex] ?? vehicle.position?.[0] ?? 0;
      const speedMps = vehicle.speedMps ?? mphToMps(vehicle.speedMph ?? 0);
      const currentZ = vehicle.position?.[2] ?? 0;
      const nextZ = currentZ + speedMps * dt;

      return {
        ...vehicle,
        speedMps,
        speedMph: vehicle.speedMph ?? mpsToMph(speedMps),
        position: [laneCenter, 0, nextZ] as [number, number, number],
      };
    });

    set({
      player: updatedPlayer,
      npcVehicles: updatedNpcVehicles,
      laneCenters: recalculatedLaneCenters,
      collision,
    });
  },
  applyMission: (mission: DrivingMissionState) => {
    set({ mission });
  },
  updateMission: async (input: MissionUpdateInput) => {
    const mission = await simulationController.updateMission(input);
    set({ mission });
  },
}));
