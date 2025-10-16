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

export type VehicleKind = "sedan" | "suv" | "truck" | "motorcycle";

export type TrafficBehaviorProfile = "steady" | "assertive" | "cautious";

export interface VehicleSnapshot {
  id: string;
  laneIndex: number;
  position: [number, number, number];
  speedMps: number;
  speedMph: number;
  heading: [number, number, number];
  lengthMeters: number;
  widthMeters: number;
  type: VehicleKind;
  behavior: TrafficBehaviorProfile;
  intent?: string;
}

export interface PlayerSnapshot extends VehicleSnapshot {
  steerAngleDeg: number;
  accelerationMps2: number;
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
  vehicles: VehicleSnapshot[];
  mission: DrivingMissionSnapshot;
  collision: boolean;
  voiceStatus?: VoiceInteractionStatus;
}

export interface VoiceInteractionStatus {
  lastUtterance?: string;
  summary?: string;
  mode?: DrivingMissionSnapshot["mode"];
  timestamp?: number;
}

export type MissionSource = "system" | "manual" | "voice" | "intent" | "rl";
export type DrivingMissionMode = "hold" | "cruise" | "lane_change" | "overtake";
export type LaneChangeDirection = "left" | "right";

export interface DrivingMissionSnapshot {
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

export interface DrivingMissionUpdate {
  targetLaneIndex?: number | null;
  cruiseTargetSpeedMph?: number;
  cruiseGapMeters?: number;
  source?: MissionSource;
  note?: string;
  mode?: DrivingMissionMode;
  returnLaneIndex?: number | null;
  laneChangeDirection?: LaneChangeDirection | null;
}

export interface DrivingObservation {
  laneIndex: number;
  laneOffsetMeters: number;
  speedMps: number;
  targetSpeedMps: number;
  cruiseTargetSpeedMps?: number;
  cruiseGapMeters?: number;
  gapAheadMeters: number;
  gapBehindMeters: number;
  relativeSpeedAheadMps: number;
  relativeSpeedBehindMps: number;
  targetLaneIndex?: number;
  distanceToMergePointMeters?: number;
  missionMode?: DrivingMissionMode;
  returnLaneIndex?: number | null;
  laneChangeDirection?: LaneChangeDirection | null;
}

export interface DrivingAction {
  lateral: number; // -1 .. 1 steer command
  acceleration: number; // throttle normalized 0..1
  brake: number; // brake normalized 0..1
  requestedLaneIndex?: number;
}

export interface RewardBreakdown {
  progress: number;
  laneKeeping: number;
  comfort: number;
  ruleCompliance: number;
  cruiseTracking: number;
  gapKeeping: number;
  collisionPenalty: number;
  total: number;
}

export interface StepTelemetry {
  collisions: number;
  laneChanges: number;
  elapsedSeconds: number;
}

export interface DrivingStepResult {
  observation: DrivingObservation;
  reward: RewardBreakdown;
  done: boolean;
  info: StepTelemetry & {
    snapshot: SimulationSnapshot;
  };
}
