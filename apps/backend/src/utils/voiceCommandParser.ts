import type { DrivingMissionUpdate, LaneChangeDirection } from "../models/simulation";

const CAR_LENGTH_METERS = 4.6;
const DEFAULT_GAP_CARS = 2;
const MPH_REGEX = /(\d+(?:\.\d+)?)\s*(?:mph|miles per hour|mile per hour)?/i;
const GAP_REGEX = /(\d+(?:\.\d+)?)\s*(?:car|cars|car length|car lengths)/i;
const DELTA_REGEX = /(\d+(?:\.\d+)?)\s*(?:mph)?/i;

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

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const parseNumberWords = (utterance: string): number | undefined => {
  const tokens = utterance.split(/[\s-]+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let matched = false;

  tokens.forEach((token) => {
    const value = NUMBER_WORDS[token];
    if (value === undefined) {
      return;
    }
    matched = true;
    if (value >= 20) {
      current += value;
    } else {
      current += value;
    }
  });

  if (!matched) return undefined;
  total += current;
  return total > 0 ? total : undefined;
};

const extractSpeed = (utterance: string): number | undefined => {
  const match = utterance.match(MPH_REGEX);
  if (match?.[1]) {
    const parsed = Number.parseFloat(match[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return parseNumberWords(utterance);
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

  const isSpeedCommand =
    utterance.includes("set speed") ||
    utterance.includes("set cruise") ||
    utterance.includes("set cruising") ||
    utterance.includes("set cruise control");
  const isCruiseCommand =
    utterance.includes("cruise control") || utterance.startsWith("cruise") || isSpeedCommand;
  const isOvertakeCommand = utterance.includes("overtake");
  const isSpeedIncrease =
    containsAny(utterance, ["increase speed", "speed up", "go faster", "faster", "raise speed"]);
  const isSpeedDecrease =
    containsAny(utterance, ["decrease speed", "slow down", "go slower", "slower", "reduce speed"]);
  const wantsLeft = containsAny(utterance, [
    "left lane",
    "lane left",
    "move left",
    "shift left",
    "leftmost lane",
    "turn left",
    "switch left",
    "change lane left",
  ]);
  const wantsRight = containsAny(utterance, [
    "right lane",
    "lane right",
    "move right",
    "shift right",
    "rightmost lane",
    "turn right",
    "switch right",
    "change lane right",
  ]);

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

  if (isSpeedIncrease || isSpeedDecrease) {
    const deltaMatch = utterance.match(DELTA_REGEX);
    const deltaValue = deltaMatch?.[1];
    const deltaMph = deltaValue ? Number.parseFloat(deltaValue) : 5;
    const signedDelta = isSpeedIncrease ? Math.abs(deltaMph) : -Math.abs(deltaMph);
    const nextSpeed = Math.max(0, currentSpeedMph + signedDelta);
    return {
      update: {
        mode: "cruise",
        cruiseTargetSpeedMph: nextSpeed,
        cruiseGapMeters: DEFAULT_GAP_CARS * CAR_LENGTH_METERS,
        targetLaneIndex: currentLaneIndex,
        returnLaneIndex: null,
        laneChangeDirection: null,
      },
      note: `Voice command: adjust speed to ${Math.round(nextSpeed)} mph`,
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
