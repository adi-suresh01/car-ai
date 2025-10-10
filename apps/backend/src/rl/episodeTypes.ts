import type { DrivingAction, DrivingObservation, RewardBreakdown } from "../models/simulation";
import type { DrivingMission } from "./drivingEnv";

export interface EpisodeMetadata {
  sceneId: string;
  command: string;
  description?: string;
}

export interface EpisodeStepRecord {
  step: number;
  timestampSeconds: number;
  observation: DrivingObservation;
  action: DrivingAction;
  reward: RewardBreakdown;
  info: {
    collisions: number;
    laneChanges: number;
  };
  done: boolean;
}

export interface EpisodeRecord {
  episodeId: string;
  seed: number;
  mission: DrivingMission;
  metadata: EpisodeMetadata;
  steps: EpisodeStepRecord[];
  summary: {
    totalReward: number;
    collisions: number;
    durationSeconds: number;
    laneChanges: number;
  };
}
