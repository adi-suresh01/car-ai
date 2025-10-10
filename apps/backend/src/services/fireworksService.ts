import { fireworksConfig } from "../config/thirdParty";
import { logger } from "../utils/logger";
import type { IntentRequestPayload, IntentResult } from "../models/voice";

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["gotoLane", "merge", "setSpeed", "takeExit", "followVehicle", "cancel"],
        },
        targetLane: { type: ["integer", "null"] },
        direction: { type: ["string", "null"], enum: ["left", "right", null] },
        targetSpeedMph: { type: ["number", "null"] },
        exitId: { type: ["string", "null"] },
        justification: { type: ["string", "null"] },
      },
      required: ["operation"],
    },
  },
  required: ["intent"],
} as const;

export class FireworksService {
  private static instance: FireworksService;

  static getInstance(): FireworksService {
    if (!FireworksService.instance) {
      FireworksService.instance = new FireworksService();
    }
    return FireworksService.instance;
  }

  async generateIntent(payload: IntentRequestPayload): Promise<IntentResult> {
    if (!fireworksConfig.apiKey) {
      throw new Error("Fireworks API key missing. Set FIREWORKS_API_KEY.");
    }

    const body = {
      model: fireworksConfig.defaultModel,
      messages: [
        {
          role: "system",
          content:
            "You are the intent recognition module for a freeway driving simulator. Convert user utterances into structured driving intents.",
        },
        {
          role: "user",
          content: JSON.stringify({
            transcript: payload.transcript,
            context: payload.context ?? {},
          }),
        },
      ],
      temperature: 0.2,
      response_format: {
        type: "json_object",
        schema: INTENT_SCHEMA,
      },
    };

    const response = await fetch(`${fireworksConfig.baseUrl}${fireworksConfig.chatCompletionsPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${fireworksConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Fireworks intent call failed", { status: response.status, errorText });
      throw new Error(`Fireworks intent call failed with status ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      [key: string]: unknown;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Fireworks response missing content");
    }

    const parsed = JSON.parse(content) as { intent: IntentResult["intent"] };

    return {
      intent: parsed.intent,
      raw: data,
    };
  }
}

export const fireworksService = FireworksService.getInstance();
