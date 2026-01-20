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

export interface TranscriptSanitizerOptions {
  allowlist?: string[];
  denylist?: string[];
  minTokens?: number;
}

const DEFAULT_COMMAND_KEYWORDS = [
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

export const sanitizeTranscript = (
  input: string,
  options: TranscriptSanitizerOptions = {},
): SanitizedTranscript => {
  const raw = String(input ?? "");
  const normalized = raw.trim();
  const stripped = normalized.replace(BRACKETED_TAGS, " ");
  const cleaned = stripped.replace(/\s+/g, " ").trim();
  const lower = cleaned.toLowerCase();

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const asciiLetters = countMatches(lower, /[a-z]/g);
  const nonAscii = countMatches(lower, /[^\x00-\x7F]/g);
  const isLikelyEnglish = asciiLetters >= 2 && nonAscii <= Math.max(1, asciiLetters * 0.4);
  const allowlist = options.allowlist && options.allowlist.length > 0 ? options.allowlist : DEFAULT_COMMAND_KEYWORDS;
  const denylist = options.denylist ?? [];
  const isCommandLike = allowlist.some((keyword) => lower.includes(keyword));
  const hasDeniedTerm = denylist.some((keyword) => lower.includes(keyword));

  let rejected = false;
  let reason: string | undefined;

  if (!cleaned || cleaned.length < 3) {
    rejected = true;
    reason = "too_short";
  } else if (options.minTokens !== undefined && tokens.length < options.minTokens) {
    rejected = true;
    reason = "too_few_tokens";
  } else if (NOISE_PATTERNS.test(cleaned)) {
    rejected = true;
    reason = "noise_tag";
  } else if (hasDeniedTerm) {
    rejected = true;
    reason = "denylist";
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
    ...(reason ? { reason } : {}),
  };
};
