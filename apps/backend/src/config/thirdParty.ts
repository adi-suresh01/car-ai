import { env } from "./env";

export const elevenLabsConfig = {
  baseUrl: "https://api.elevenlabs.io",
  speechToTextPath: "/v1/speech-to-text",
  textToSpeechPath: "/v1/text-to-speech",
  apiKey: env.xiApiKey,
  webhookSecret: env.xiWebhookSecret,
};

export const fireworksConfig = {
  baseUrl: "https://api.fireworks.ai",
  chatCompletionsPath: "/inference/v1/chat/completions",
  rlFinetunePath: "/finetune/v1/jobs",
  evaluationJobsPath: "/evaluations/v1/jobs",
  modelUploadPath: "/models/uploads",
  apiKey: env.fireworksApiKey,
  defaultModel: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  defaultRlBaseModel: env.fireworksRlBaseModel ?? "accounts/fireworks/models/llama-v3p1-8b-instruct",
  defaultEvaluatorSuite: env.fireworksEvalSuite ?? "voice-drive-lane-merge-beta",
};
