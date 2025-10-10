import type { DrivingMissionUpdate, LaneChangeDirection } from "../models/simulation";

const CAR_LENGTH_METERS = 4.6;
const DEFAULT_GAP_CARS = 2;
const MPH_REGEX = /(\d+(?:\.\d+)?)\s*(?:mph|miles per hour|mile per hour)?/i;
const GAP_REGEX = /(\d+(?:\.\d+)?)\s*(?:car|cars|car length|car lengths)/i;

export interface VoiceCommandContext {
  currentSpeedMph: number;
  currentLaneIndex: number;
  laneCount: number;
}

export interface VoiceMissionParseResult {
  update: DrivingMissionUpdate;
  note?: string;
}

const clampLane = (value: number, laneCount: number) => {
  if (laneCount <= 0) return 0;
  return Math.max(0, Math.min(laneCount - 1, value));
};

const extractSpeed = (utterance: string): number | undefined => {
  const match = utterance.match(MPH_REGEX);
  if (!match) return undefined;
  const value = match[1];
  return value ? Number.parseFloat(value) : undefined;
};

const extractGapCars = (utterance: string): number | undefined => {
  const match = utterance.match(GAP_REGEX);
  if (!match) return undefined;
  const value = match[1];
  return value ? Number.parseFloat(value) : undefined;
};

const containsAny = (utterance: string, phrases: string[]) =>
  phrases.some((phrase) => utterance.includes(phrase));

export const parseVoiceMission = (
  rawUtterance: string,
  context: VoiceCommandContext,
): VoiceMissionParseResult | null => {
  const utterance = rawUtterance.toLowerCase().trim();
  if (!utterance) {
    return null;
  }

  const { currentSpeedMph, currentLaneIndex, laneCount } = context;

  const isCruiseCommand = utterance.includes("cruise control") || utterance.startsWith("cruise");
  const isOvertakeCommand = utterance.includes("overtake");
  const wantsLeft = containsAny(utterance, ["left lane", "move left", "shift left", "leftmost lane"]);
  const wantsRight = containsAny(utterance, ["right lane", "move right", "shift right", "rightmost lane"]);

  if (isOvertakeCommand) {
    const preferredDirections: LaneChangeDirection[] = wantsRight ? ["right", "left"] : ["left", "right"];
    for (const direction of preferredDirections) {
      const delta = direction === "left" ? -1 : 1;
      const candidateLane = clampLane(currentLaneIndex + delta, laneCount);
      const laneChanged = candidateLane !== currentLaneIndex;
      if (laneChanged) {
        return {
          update: {
            mode: "overtake",
            targetLaneIndex: candidateLane,
            returnLaneIndex: currentLaneIndex,
            laneChangeDirection: direction,
          },
          note: `Voice command: overtake via ${direction} lane`,
        };
      }
    }
    return {
      update: {},
      note: "Voice command: overtake requested but no adjacent lane available",
    };
  }

  if (isCruiseCommand) {
    const speedMph = extractSpeed(utterance) ?? currentSpeedMph;
    const gapCars = extractGapCars(utterance) ?? DEFAULT_GAP_CARS;
    const gapMeters = gapCars * CAR_LENGTH_METERS;
    return {
      update: {
        mode: "cruise",
        cruiseTargetSpeedMph: speedMph,
        cruiseGapMeters: gapMeters,
        targetLaneIndex: currentLaneIndex,
        returnLaneIndex: null,
        laneChangeDirection: null,
      },
      note: `Voice command: cruise ${Math.round(speedMph)} mph, gap ${gapCars} cars`,
    };
  }

  if (wantsLeft || wantsRight) {
    const direction: LaneChangeDirection = wantsLeft ? "left" : "right";
    const delta = direction === "left" ? -1 : 1;
    const candidateLane = clampLane(currentLaneIndex + delta, laneCount);
    if (candidateLane === currentLaneIndex) {
      return {
        update: {},
        note: `Voice command: cannot move ${direction}; lane unavailable`,
      };
    }
    return {
      update: {
        mode: "lane_change",
        targetLaneIndex: candidateLane,
        laneChangeDirection: direction,
        returnLaneIndex: null,
      },
      note: `Voice command: move ${direction} to lane ${candidateLane}`,
    };
  }

  return null;
};
