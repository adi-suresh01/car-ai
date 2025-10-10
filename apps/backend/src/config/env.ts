import dotenv from "dotenv";

dotenv.config();

const DEFAULT_PORT = 4000;

const optional = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  xiApiKey: optional(process.env.XI_API_KEY),
  xiWebhookSecret: optional(process.env.XI_WEBHOOK_SECRET),
  fireworksApiKey: optional(process.env.FIREWORKS_API_KEY),
  fireworksRlBaseModel: optional(process.env.FIREWORKS_RL_BASE_MODEL),
  fireworksEvalSuite: optional(process.env.FIREWORKS_EVAL_SUITE),
};

export const isProduction = env.nodeEnv === "production";
