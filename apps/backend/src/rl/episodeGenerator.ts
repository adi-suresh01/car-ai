import { randomInt } from "crypto";
import type { DrivingEnvConfig, DrivingMission } from "./drivingEnv";
import { DrivingEnvironment } from "./drivingEnv";
import type { EpisodeRecord, EpisodeStepRecord, EpisodeMetadata } from "./episodeTypes";
import type { DrivingAction } from "../models/simulation";
import { cruiseHeuristicPolicy } from "./policies/cruiseHeuristic";

const MPH_TO_MPS = 0.44704;
const SAFE_RANDOM_MAX = 281_474_976_710_655; // 2^48 - 1 (limit for crypto.randomInt)

export interface MissionOverrides {
  targetLaneIndex?: number | null;
  cruiseTargetSpeedMph?: number;
  cruiseGapMeters?: number;
}

export interface EpisodeGenerationOptions {
  mission: MissionOverrides;
  maxSteps?: number;
  seed?: number;
  metadata: EpisodeMetadata;
  controller?:
    | ((
        observation: EpisodeStepRecord["observation"],
        mission: DrivingMission,
      ) => DrivingAction)
    | typeof cruiseHeuristicPolicy;
}

export interface EpisodeBatchOptions extends EpisodeGenerationOptions {
  episodeCount: number;
  envConfig?: DrivingEnvConfig;
}

const resolveMissionOverrides = (
  base: DrivingMission,
  overrides: MissionOverrides,
): Partial<DrivingMission> => ({
  targetLaneIndex:
    overrides.targetLaneIndex === undefined ? base.targetLaneIndex : overrides.targetLaneIndex,
  cruiseTargetSpeedMps:
    overrides.cruiseTargetSpeedMph === undefined
      ? base.cruiseTargetSpeedMps
      : overrides.cruiseTargetSpeedMph * MPH_TO_MPS,
  cruiseGapMeters:
    overrides.cruiseGapMeters === undefined ? base.cruiseGapMeters : overrides.cruiseGapMeters,
});

const computeSummary = (steps: EpisodeStepRecord[]) => {
  const totalReward = steps.reduce((sum, step) => sum + step.reward.total, 0);
  const collisions = steps.reduce((sum, step) => sum + step.info.collisions, 0);
  const laneChanges = steps.reduce((sum, step) => sum + step.info.laneChanges, 0);
  const lastStep = steps.length > 0 ? steps[steps.length - 1]! : undefined;
  const durationSeconds = lastStep ? lastStep.timestampSeconds : 0;
  return { totalReward, collisions, laneChanges, durationSeconds };
};

export const simulateEpisode = (
  env: DrivingEnvironment,
  options: EpisodeGenerationOptions,
): EpisodeRecord => {
  const controller = options.controller ?? cruiseHeuristicPolicy;
  const baseMission = env.getMission();
  const missionUpdate = resolveMissionOverrides(baseMission, options.mission);
  const { observation: initialObservation, snapshot } = env.reset(missionUpdate);
  let observation = initialObservation;
  const mission = env.getMission();
  const dt = env.getTimeStepSeconds();
  const maxSteps = options.maxSteps ?? Math.floor(180 / dt);
  const steps: EpisodeStepRecord[] = [];

  let done = false;
  let stepIndex = 0;
  let lastStepResultSnapshot = snapshot;

  while (!done && stepIndex < maxSteps) {
    const action = controller(observation, mission);
    const result = env.step(action);
    steps.push({
      step: stepIndex,
      timestampSeconds: (stepIndex + 1) * dt,
      observation,
      action,
      reward: result.reward,
      info: {
        collisions: result.info.collisions,
        laneChanges: result.info.laneChanges,
      },
      done: result.done,
    });
    observation = result.observation;
    done = result.done;
    lastStepResultSnapshot = result.info.snapshot;
    stepIndex += 1;
  }

  const summary = computeSummary(steps);

  return {
    episodeId: env.getEpisodeId(),
    seed: options.seed ?? randomInt(SAFE_RANDOM_MAX),
    mission,
    metadata: {
      ...options.metadata,
      sceneId: lastStepResultSnapshot.sceneId,
    },
    steps,
    summary,
  };
};

export const generateEpisodeBatch = (options: EpisodeBatchOptions): EpisodeRecord[] => {
  const { episodeCount, envConfig } = options;
  const env = new DrivingEnvironment(envConfig);
  const episodes: EpisodeRecord[] = [];
  for (let i = 0; i < episodeCount; i += 1) {
    const episodeOptions: EpisodeGenerationOptions = {
      mission: options.mission,
      metadata: options.metadata,
    };
    if (options.controller) {
      episodeOptions.controller = options.controller;
    }
    if (options.maxSteps !== undefined) {
      episodeOptions.maxSteps = options.maxSteps;
    }
    const seed = options.seed !== undefined ? options.seed + i : undefined;
    if (seed !== undefined) {
      episodeOptions.seed = seed;
    }
    const episode = simulateEpisode(env, episodeOptions);
    episodes.push(episode);
  }
  return episodes;
};
