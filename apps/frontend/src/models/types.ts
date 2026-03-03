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
  positionS: number;
  lateralT: number;
  roadHeadingDeg: number;
  positionXWorld: number;
  positionZWorld: number;
  curvature: number;
}

export type NPCBehavior = "aggressive" | "defensive" | "cruiser";

export interface VehicleState {
  id: string;
  type: VehicleType;
  laneIndex: number;
  speedMph: number;
  speedMps: number;
  position: [number, number, number];
  heading: [number, number, number];
  behavior?: NPCBehavior;
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

export interface ScenarioEnvironment {
  timeOfDay: string;
  weather: string;
  visibility: number;
}

export interface ScenarioDefinition {
  name: string;
  description: string;
  npcCount: number;
  numLanes: number;
  environment: ScenarioEnvironment;
}

export const NPC_BEHAVIOR_COLORS: Record<NPCBehavior, { body: number; emissive: number; label: string }> = {
  aggressive: { body: 0xff3333, emissive: 0xff1111, label: "AGG" },
  defensive: { body: 0x3388ff, emissive: 0x2266cc, label: "DEF" },
  cruiser: { body: 0xcccccc, emissive: 0x888888, label: "CRU" },
};

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

export interface RouteControlPoint {
  x: number;
  z: number;
  heading: number;
  curvature: number;
  s: number;
}

export interface RouteGeometry {
  controlPoints: RouteControlPoint[];
  laneCount: number;
  laneWidth: number;
  totalLength: number;
  speedLimits: Array<{ s: number; speedMph: number }>;
}

export interface RouteSummary {
  distance: number;
  duration: number;
  turnCount: number;
  previewPolyline: Array<[number, number]>;
}

export type TurnType =
  | "straight"
  | "slight_left"
  | "slight_right"
  | "left"
  | "right"
  | "sharp_left"
  | "sharp_right"
  | "hairpin_left"
  | "hairpin_right"
  | "arrive";

export interface TurnDirection {
  instruction: string;
  distanceMeters: number;
  s: number;
  turnType: TurnType;
}

export interface NavigationState {
  route: RouteSummary | null;
  geometry: RouteGeometry | null;
  directions: TurnDirection[];
  currentDirectionIndex: number;
  distanceRemaining: number;
  etaSeconds: number;
}
