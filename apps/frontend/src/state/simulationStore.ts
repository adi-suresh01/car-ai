import { create } from "zustand";
import type {
  PlayerState,
  VehicleState,
  MissionState,
  SimulationLayout,
  VoiceCommandEntry,
} from "../models/types";

interface InterpolatedVehicle extends VehicleState {
  prevPosition: [number, number, number];
  targetPosition: [number, number, number];
  interpolationT: number;
}

interface SimulationStore {
  connected: boolean;
  serverTimestamp: number;

  player: PlayerState;
  vehicles: InterpolatedVehicle[];
  mission: MissionState;
  layout: SimulationLayout | null;
  collision: boolean;

  voiceActive: boolean;
  voiceLevel: number;
  voiceHistory: VoiceCommandEntry[];

  viewMode: "driver" | "topdown";
  showDebugPanel: boolean;

  autopilotEnabled: boolean;
  autopilotReady: boolean;
  autopilotLatencyMs: number;

  setConnected: (connected: boolean) => void;
  updateFromServer: (
    timestamp: number,
    player: PlayerState,
    vehicles: VehicleState[],
    mission: MissionState,
    collision: boolean
  ) => void;
  setLayout: (layout: SimulationLayout) => void;
  setVoiceActive: (active: boolean) => void;
  setVoiceLevel: (level: number) => void;
  addVoiceCommand: (entry: VoiceCommandEntry) => void;
  setViewMode: (mode: "driver" | "topdown") => void;
  toggleDebugPanel: () => void;
  interpolateVehicles: (alpha: number) => void;
  setAutopilotEnabled: (enabled: boolean) => void;
  setAutopilotReady: (ready: boolean) => void;
  setAutopilotLatencyMs: (ms: number) => void;
}

const DEFAULT_PLAYER: PlayerState = {
  laneIndex: 2,
  lateralOffset: 0,
  speedMph: 0,
  speedMps: 0,
  steerAngleDeg: 0,
  headingRad: 0,
  positionZ: 0,
  gear: 1,
};

const DEFAULT_MISSION: MissionState = {
  mode: "hold",
  targetLaneIndex: 2,
  cruiseTargetSpeedMph: 65,
  cruiseGapMeters: 32,
  returnLaneIndex: null,
  laneChangeDirection: null,
  source: "system",
  updatedAt: Date.now(),
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  connected: false,
  serverTimestamp: 0,

  player: DEFAULT_PLAYER,
  vehicles: [],
  mission: DEFAULT_MISSION,
  layout: null,
  collision: false,

  voiceActive: false,
  voiceLevel: 0,
  voiceHistory: [],

  viewMode: "driver",
  showDebugPanel: false,

  autopilotEnabled: false,
  autopilotReady: false,
  autopilotLatencyMs: 0,

  setConnected: (connected) => set({ connected }),

  updateFromServer: (timestamp, player, vehicles, mission, collision) => {
    const currentVehicles = get().vehicles;
    const vehicleMap = new Map(currentVehicles.map((v) => [v.id, v]));

    const interpolated: InterpolatedVehicle[] = vehicles.map((v) => {
      const existing = vehicleMap.get(v.id);
      return {
        ...v,
        prevPosition: existing
          ? ([...existing.targetPosition] as [number, number, number])
          : ([...v.position] as [number, number, number]),
        targetPosition: [...v.position] as [number, number, number],
        interpolationT: 0,
      };
    });

    set({
      serverTimestamp: timestamp,
      player,
      vehicles: interpolated,
      mission,
      collision,
    });
  },

  setLayout: (layout) => set({ layout }),
  setVoiceActive: (active) => set({ voiceActive: active }),
  setVoiceLevel: (level) => set({ voiceLevel: level }),

  addVoiceCommand: (entry) =>
    set((state) => ({
      voiceHistory: [entry, ...state.voiceHistory].slice(0, 50),
    })),

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleDebugPanel: () =>
    set((state) => ({ showDebugPanel: !state.showDebugPanel })),

  setAutopilotEnabled: (enabled) => set({ autopilotEnabled: enabled }),
  setAutopilotReady: (ready) => set({ autopilotReady: ready }),
  setAutopilotLatencyMs: (ms) => set({ autopilotLatencyMs: ms }),

  interpolateVehicles: (alpha) => {
    set((state) => ({
      vehicles: state.vehicles.map((v) => ({
        ...v,
        interpolationT: Math.min(1, alpha),
        position: [
          v.prevPosition[0] + (v.targetPosition[0] - v.prevPosition[0]) * alpha,
          v.prevPosition[1] + (v.targetPosition[1] - v.prevPosition[1]) * alpha,
          v.prevPosition[2] + (v.targetPosition[2] - v.prevPosition[2]) * alpha,
        ] as [number, number, number],
      })),
    }));
  },
}));

export type { InterpolatedVehicle };
