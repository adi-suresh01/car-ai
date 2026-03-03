import { create } from "zustand";
import type {
  PlayerState,
  VehicleState,
  MissionState,
  SimulationLayout,
  VoiceCommandEntry,
  ScenarioDefinition,
  RouteGeometry,
  RouteSummary,
  TurnDirection,
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

  showHelpOverlay: boolean;
  showScenarioSelector: boolean;
  scenarios: ScenarioDefinition[];
  activeScenarioId: string | null;
  scenariosLoading: boolean;

  viewTransitionProgress: number;

  routeGeometry: RouteGeometry | null;
  routeSummary: RouteSummary | null;
  routeDirections: TurnDirection[];
  currentDirectionIndex: number;
  distanceRemaining: number;
  etaSeconds: number;
  routeLoading: boolean;
  routeError: string | null;
  playerPositionS: number;
  playerLateralT: number;

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

  toggleHelpOverlay: () => void;
  setShowScenarioSelector: (show: boolean) => void;
  setScenarios: (scenarios: ScenarioDefinition[]) => void;
  setActiveScenarioId: (id: string | null) => void;
  setScenariosLoading: (loading: boolean) => void;
  setViewTransitionProgress: (progress: number) => void;

  setRouteGeometry: (geometry: RouteGeometry | null) => void;
  setRouteSummary: (summary: RouteSummary | null) => void;
  setRouteDirections: (directions: TurnDirection[]) => void;
  setCurrentDirectionIndex: (index: number) => void;
  updateNavProgress: (positionS: number, lateralT: number) => void;
  setRouteLoading: (loading: boolean) => void;
  setRouteError: (error: string | null) => void;
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
  positionS: 0,
  lateralT: 0,
  roadHeadingDeg: 0,
  positionXWorld: 0,
  positionZWorld: 0,
  curvature: 0,
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

  showHelpOverlay: false,
  showScenarioSelector: false,
  scenarios: [],
  activeScenarioId: null,
  scenariosLoading: false,

  viewTransitionProgress: 1,

  routeGeometry: null,
  routeSummary: null,
  routeDirections: [],
  currentDirectionIndex: 0,
  distanceRemaining: 0,
  etaSeconds: 0,
  routeLoading: false,
  routeError: null,
  playerPositionS: 0,
  playerLateralT: 0,

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

    // Update navigation progress from server-provided Frenet coordinates
    if (player.positionS !== undefined) {
      get().updateNavProgress(player.positionS, player.lateralT ?? 0);
    }
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

  toggleHelpOverlay: () =>
    set((state) => ({ showHelpOverlay: !state.showHelpOverlay })),
  setShowScenarioSelector: (show) => set({ showScenarioSelector: show }),
  setScenarios: (scenarios) => set({ scenarios }),
  setActiveScenarioId: (id) => set({ activeScenarioId: id }),
  setScenariosLoading: (loading) => set({ scenariosLoading: loading }),
  setViewTransitionProgress: (progress) => set({ viewTransitionProgress: progress }),

  setRouteGeometry: (geometry) => set({ routeGeometry: geometry }),
  setRouteSummary: (summary) => set({ routeSummary: summary }),
  setRouteDirections: (directions) => set({ routeDirections: directions }),
  setCurrentDirectionIndex: (index) => set({ currentDirectionIndex: index }),
  updateNavProgress: (positionS, lateralT) => {
    const state = get();
    const totalLength = state.routeGeometry?.totalLength ?? 0;
    const distanceRemaining = Math.max(0, totalLength - positionS);

    const speedMps = state.player.speedMps;
    const etaSeconds = speedMps > 0.5 ? distanceRemaining / speedMps : 0;

    let dirIndex = state.currentDirectionIndex;
    const dirs = state.routeDirections;
    while (dirIndex < dirs.length - 1 && dirs[dirIndex].s < positionS) {
      dirIndex++;
    }

    set({
      playerPositionS: positionS,
      playerLateralT: lateralT,
      distanceRemaining,
      etaSeconds,
      currentDirectionIndex: dirIndex,
    });
  },
  setRouteLoading: (loading) => set({ routeLoading: loading }),
  setRouteError: (error) => set({ routeError: error }),

  interpolateVehicles: (alpha) => {
    const smoothAlpha = 1 - Math.pow(1 - Math.min(1, alpha), 3);
    set((state) => ({
      vehicles: state.vehicles.map((v) => ({
        ...v,
        interpolationT: Math.min(1, alpha),
        position: [
          v.prevPosition[0] + (v.targetPosition[0] - v.prevPosition[0]) * smoothAlpha,
          v.prevPosition[1] + (v.targetPosition[1] - v.prevPosition[1]) * smoothAlpha,
          v.prevPosition[2] + (v.targetPosition[2] - v.prevPosition[2]) * smoothAlpha,
        ] as [number, number, number],
      })),
    }));
  },
}));

export type { InterpolatedVehicle };
