import type { DrivingMissionUpdate } from "../models/simulation";
import { parseVoiceMission, type VoiceCommandContext } from "./voiceCommandParser";

export interface GrammarMatchResult {
  update: DrivingMissionUpdate;
  note?: string;
}

export const matchVoiceCommandGrammar = (
  utterance: string,
  context: VoiceCommandContext,
): GrammarMatchResult | null => {
  const parsed = parseVoiceMission(utterance, context);
  if (!parsed) {
    return null;
  }
  const meaningfulKeys: Array<keyof DrivingMissionUpdate> = [
    "cruiseTargetSpeedMph",
    "cruiseGapMeters",
    "targetLaneIndex",
    "returnLaneIndex",
    "laneChangeDirection",
    "mode",
  ];
  const hasMeaningfulUpdate = meaningfulKeys.some((key) => parsed.update[key] !== undefined);
  if (!hasMeaningfulUpdate) {
    return null;
  }
  return parsed;
};
