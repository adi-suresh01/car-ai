import type { VoiceInteractionStatus } from "./simulation";

export interface TranscriptionRequestPayload {
  audioUrl: string;
  modelId?: string;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
  raw: unknown;
}

export interface IntentRequestPayload {
  transcript: string;
  context?: Record<string, unknown>;
}

export interface LaneIntent {
  operation: "gotoLane" | "merge" | "setSpeed" | "takeExit" | "followVehicle" | "cancel";
  targetLane?: number;
  direction?: "left" | "right";
  targetSpeedMph?: number;
  exitId?: string;
  justification?: string;
}

export interface IntentResult {
  intent: LaneIntent;
  raw: unknown;
}

export interface SpeechSynthesisRequestPayload {
  text: string;
  voiceId: string;
  modelId?: string;
  latencyOptimization?: "default" | "medium" | "maximum";
}

export interface SpeechSynthesisResult {
  audioBase64: string;
  format: "mp3" | "wav" | "pcm";
  raw: unknown;
}

const VALID_MODES = ["hold", "cruise", "lane_change", "overtake"] as const;

export const isVoiceInteractionStatus = (value: unknown): value is VoiceInteractionStatus => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const { lastUtterance, summary, mode, timestamp } = candidate;

  if (lastUtterance !== undefined && typeof lastUtterance !== "string") {
    return false;
  }
  if (summary !== undefined && typeof summary !== "string") {
    return false;
  }
  if (mode !== undefined && !VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
    return false;
  }
  if (timestamp !== undefined && typeof timestamp !== "number") {
    return false;
  }
  return true;
};
