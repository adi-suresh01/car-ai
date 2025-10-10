export type LaneType = "general" | "express" | "exit" | "carpool";

export interface LaneDefinition {
  id: string;
  index: number;
  type: LaneType;
  speedLimitMph: number;
  description: string;
}

export interface ExitDefinition {
  id: string;
  name: string;
  mileMarker: number;
  connectsTo: string;
}

export interface RoadScene {
  id: string;
  name: string;
  lanes: LaneDefinition[];
  exits: ExitDefinition[];
  sceneryTheme: "coastal" | "urban" | "mountain";
  ambientLight: number;
  skyColor: string;
}

export interface SimulationLayoutSummary {
  activeScene: RoadScene;
  scenes: RoadScene[];
}

export type TrafficBehaviorProfile = "steady" | "assertive" | "cautious";

export interface VehicleState {
  id: string;
  laneIndex: number;
  speedMph: number;
  position: [number, number, number];
  heading: [number, number, number];
  intent?: string;
  speedMps?: number;
  lengthMeters?: number;
  widthMeters?: number;
  type?: "sedan" | "suv" | "truck" | "motorcycle";
  behavior?: TrafficBehaviorProfile;
}

export interface PlayerSnapshot extends VehicleState {
  steerAngleDeg?: number;
  accelerationMps2?: number;
}

export interface TrafficLaneProfile {
  laneIndex: number;
  type: LaneType;
  targetSpeedMph: number;
  minSpeedMph: number;
  maxSpeedMph: number;
  preferredSpacingMeters: number;
  spawnRatePerMinute: number;
}

export interface SimulationSnapshot {
  timestamp: number;
  sceneId: string;
  lanes: TrafficLaneProfile[];
  player: PlayerSnapshot;
  vehicles: VehicleState[];
  mission: DrivingMissionState;
}

export type MissionSource = "system" | "manual" | "voice" | "intent" | "rl";
export type DrivingMissionMode = "hold" | "cruise" | "lane_change" | "overtake";
export type LaneChangeDirection = "left" | "right";

export interface DrivingMissionState {
  targetLaneIndex: number | null;
  cruiseTargetSpeedMph: number;
  cruiseGapMeters: number;
  mode: DrivingMissionMode;
  returnLaneIndex?: number | null;
  laneChangeDirection?: LaneChangeDirection | null;
  source: MissionSource;
  note?: string;
  updatedAt: number;
}
