import type { DrivingMissionUpdate } from "../models/simulation";
import type { LaneIntent } from "../models/voice";

interface IntentContext {
  currentLaneIndex: number;
  laneCount: number;
}

const clampLane = (index: number, laneCount: number) => {
  if (laneCount <= 0) return 0;
  return Math.max(0, Math.min(laneCount - 1, index));
};

export const mapIntentToMission = (
  intent: LaneIntent,
  context: IntentContext,
): DrivingMissionUpdate | null => {
  switch (intent.operation) {
    case "gotoLane": {
      if (intent.targetLane === undefined || intent.targetLane === null) return null;
      const targetLaneIndex = clampLane(intent.targetLane, context.laneCount);
      const direction =
        intent.direction ??
        (targetLaneIndex > context.currentLaneIndex ? "right" : targetLaneIndex < context.currentLaneIndex ? "left" : undefined);
      return {
        mode: "lane_change",
        targetLaneIndex,
        returnLaneIndex: null,
        laneChangeDirection: direction ?? null,
      };
    }
    case "merge": {
      const targetLaneIndex =
        intent.targetLane !== undefined && intent.targetLane !== null
          ? clampLane(intent.targetLane, context.laneCount)
          : clampLane(context.currentLaneIndex + (intent.direction === "left" ? -1 : 1), context.laneCount);
      return {
        mode: "lane_change",
        targetLaneIndex,
        returnLaneIndex: null,
        laneChangeDirection: intent.direction ?? null,
      };
    }
    case "setSpeed": {
      if (intent.targetSpeedMph === undefined || intent.targetSpeedMph === null) return null;
      return {
        mode: "cruise",
        cruiseTargetSpeedMph: intent.targetSpeedMph,
      };
    }
    case "takeExit": {
      const targetLaneIndex = clampLane(context.laneCount - 1, context.laneCount);
      return {
        mode: "lane_change",
        targetLaneIndex,
        returnLaneIndex: null,
        laneChangeDirection: "right",
        note: intent.exitId ? `Exit intent: ${intent.exitId}` : undefined,
      };
    }
    case "followVehicle": {
      return {
        mode: "cruise",
      };
    }
    case "cancel": {
      return {
        mode: "hold",
      };
    }
    default:
      return null;
  }
};
