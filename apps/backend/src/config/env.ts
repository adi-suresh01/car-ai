import dotenv from "dotenv";

dotenv.config();

const DEFAULT_PORT = 4000;

const optional = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseCsv = (value?: string | null) => {
  const raw = optional(value);
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const parseNumber = (value?: string | null) => {
  const raw = optional(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBoolean = (value?: string | null) => {
  const raw = optional(value);
  if (!raw) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  xiApiKey: optional(process.env.XI_API_KEY),
  xiWebhookSecret: optional(process.env.XI_WEBHOOK_SECRET),
  fireworksApiKey: optional(process.env.FIREWORKS_API_KEY),
  fireworksRlBaseModel: optional(process.env.FIREWORKS_RL_BASE_MODEL),
  fireworksEvalSuite: optional(process.env.FIREWORKS_EVAL_SUITE),
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  jsonBodyLimit: optional(process.env.JSON_BODY_LIMIT) ?? "1mb",
  voiceCommandAllowlist: parseCsv(process.env.VOICE_COMMAND_ALLOWLIST),
  voiceCommandDenylist: parseCsv(process.env.VOICE_COMMAND_DENYLIST),
  voiceMinTokens: process.env.VOICE_MIN_TOKENS ? Number(process.env.VOICE_MIN_TOKENS) : undefined,
};

export const isProduction = env.nodeEnv === "production";
