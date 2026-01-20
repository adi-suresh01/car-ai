export interface SanitizedTranscript {
  raw: string;
  normalized: string;
  cleaned: string;
  lower: string;
  isLikelyEnglish: boolean;
  isCommandLike: boolean;
  rejected: boolean;
  reason?: string;
}

const COMMAND_KEYWORDS = [
  "cruise",
  "speed",
  "mph",
  "faster",
  "slower",
  "left",
  "right",
  "lane",
  "overtake",
  "gap",
  "exit",
  "offramp",
  "merge",
  "traffic",
  "police",
  "cop",
  "hazard",
  "accident",
  "debris",
  "camera",
];

const NOISE_PATTERNS = /(music|applause|laughter|noise|silence)/i;
const BRACKETED_TAGS = /\[[^\]]*\]|\([^\)]*\)/g;

const countMatches = (value: string, pattern: RegExp) => (value.match(pattern) ?? []).length;

export const sanitizeTranscript = (input: string): SanitizedTranscript => {
  const raw = String(input ?? "");
  const normalized = raw.trim();
  const stripped = normalized.replace(BRACKETED_TAGS, " ");
  const cleaned = stripped.replace(/\s+/g, " ").trim();
  const lower = cleaned.toLowerCase();

  const asciiLetters = countMatches(lower, /[a-z]/g);
  const nonAscii = countMatches(lower, /[^\x00-\x7F]/g);
  const isLikelyEnglish = asciiLetters >= 2 && nonAscii <= Math.max(1, asciiLetters * 0.4);
  const isCommandLike = COMMAND_KEYWORDS.some((keyword) => lower.includes(keyword));

  let rejected = false;
  let reason: string | undefined;

  if (!cleaned || cleaned.length < 3) {
    rejected = true;
    reason = "too_short";
  } else if (NOISE_PATTERNS.test(cleaned)) {
    rejected = true;
    reason = "noise_tag";
  } else if (!isLikelyEnglish) {
    rejected = true;
    reason = "non_english";
  }

  return {
    raw,
    normalized,
    cleaned,
    lower,
    isLikelyEnglish,
    isCommandLike,
    rejected,
    reason,
  };
};
