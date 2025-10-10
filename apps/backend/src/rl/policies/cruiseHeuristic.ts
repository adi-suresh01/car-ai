import type { DrivingAction, DrivingObservation } from "../../models/simulation";
import type { DrivingMission } from "../drivingEnv";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const LANE_WIDTH_METERS = 3.6;

export interface CruiseHeuristicOptions {
  speedAggressiveness?: number;
  laneAggressiveness?: number;
}

const DEFAULT_OPTIONS: Required<CruiseHeuristicOptions> = {
  speedAggressiveness: 0.35,
  laneAggressiveness: 0.8,
};

export const cruiseHeuristicPolicy = (
  observation: DrivingObservation,
  mission: DrivingMission,
  options: CruiseHeuristicOptions = {},
): DrivingAction => {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  const targetSpeed =
    mission.cruiseTargetSpeedMps && mission.cruiseTargetSpeedMps > 0
      ? mission.cruiseTargetSpeedMps
      : observation.targetSpeedMps;
  const gapTarget = mission.cruiseGapMeters > 0 ? mission.cruiseGapMeters : 0;

  const speedError = targetSpeed - observation.speedMps;
  let acceleration = 0;
  let brake = 0;

  if (speedError > 0) {
    acceleration = clamp(speedError * mergedOptions.speedAggressiveness, 0, 1);
  } else if (speedError < 0) {
    brake = clamp(-speedError * (mergedOptions.speedAggressiveness * 0.9), 0, 1);
  }

  if (gapTarget > 0 && observation.gapAheadMeters < gapTarget) {
    const gapDeficit = gapTarget - observation.gapAheadMeters;
    const closingSpeed = Math.max(0, -observation.relativeSpeedAheadMps);
    const brakeDemand =
      gapDeficit / Math.max(gapTarget, 1) + closingSpeed / Math.max(targetSpeed, 0.1);
    brake = Math.max(brake, clamp(brakeDemand, 0, 1));
    acceleration = Math.min(acceleration, 0.25);
  }

  const desiredLaneIndex =
    mission.targetLaneIndex ?? observation.targetLaneIndex ?? observation.laneIndex;
  const laneDelta = desiredLaneIndex - observation.laneIndex;
  const requestedLaneIndex = Math.max(0, Math.round(desiredLaneIndex));
  const lateral =
    laneDelta === 0
      ? clamp(-observation.laneOffsetMeters / (LANE_WIDTH_METERS * 0.5), -1, 1)
      : clamp(laneDelta * mergedOptions.laneAggressiveness, -1, 1);

  return {
    acceleration,
    brake,
    lateral,
    requestedLaneIndex,
  };
};
