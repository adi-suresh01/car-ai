export type VehicleType = "sedan" | "suv" | "truck" | "sports-car" | "motorcycle";

export type MissionMode = "hold" | "cruise" | "lane_change" | "overtake";

export interface MissionState {
  mode: MissionMode;
  targetLaneIndex: number;
  cruiseTargetSpeedMph: number;
  cruiseGapMeters: number;
  returnLaneIndex: number | null;
  laneChangeDirection: "left" | "right" | null;
  source: "voice" | "autopilot" | "manual" | "system";
  updatedAt: number;
}

export interface PlayerState {
  laneIndex: number;
  lateralOffset: number;
  speedMph: number;
  speedMps: number;
  steerAngleDeg: number;
  headingRad: number;
  positionZ: number;
  gear: number;
}

export interface VehicleState {
  id: string;
  type: VehicleType;
  laneIndex: number;
  speedMph: number;
  speedMps: number;
  position: [number, number, number];
  heading: [number, number, number];
}

export interface SimulationLayout {
  lanes: LaneDefinition[];
  sceneName: string;
  laneCenters: number[];
}

export interface LaneDefinition {
  index: number;
  type: "travel" | "exit" | "shoulder";
  speedLimitMph: number;
  description: string;
}

export interface RLObservation {
  lanePosition: number;
  lateralOffset: number;
  speed: number;
  targetSpeed: number;
  gapAhead: number;
  gapBehind: number;
  relSpeedAhead: number;
  relSpeedBehind: number;
  missionMode: number;
  targetLane: number;
  laneChangeDir: number;
  crossLaneGap: number;
}

export interface RLAction {
  throttle: number;
  brake: number;
  laneRequest: number;
}

export interface SimulationStateMessage {
  type: "state";
  timestamp: number;
  player: PlayerState;
  vehicles: VehicleState[];
  mission: MissionState;
  collision: boolean;
}

export interface PlayerInputMessage {
  type: "player_input";
  steering: number;
  throttle: number;
  brake: number;
}

export interface VoiceCommandMessage {
  type: "voice_command";
  utterance: string;
}

export type ClientMessage = PlayerInputMessage | VoiceCommandMessage;

export interface VoiceTranscription {
  text: string;
  timestamp: number;
  confidence: number;
}

export interface VoiceCommandEntry {
  id: string;
  utterance: string;
  interpretedAs: string;
  timestamp: number;
  success: boolean;
}

export const PHYSICS = {
  LANE_WIDTH_METERS: 3.6,
  WHEELBASE_METERS: 2.8,
  MAX_SPEED_MPH: 120,
  MAX_STEER_DEG: 38,
  STEER_RATE_DEG_PER_S: 140,
  PHYSICS_HZ: 60,
  PHYSICS_DT: 0.01667,
  ROLLING_RESIST_MPS2: 0.15,
  AERO_DRAG_COEFF: 0.0032,
  BRAKE_RATE_MPH_PER_S: 90,
} as const;
