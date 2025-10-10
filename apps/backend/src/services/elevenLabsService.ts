import crypto from "crypto";
import { elevenLabsConfig } from "../config/thirdParty";
import { logger } from "../utils/logger";
import type {
  SpeechSynthesisRequestPayload,
  SpeechSynthesisResult,
  TranscriptionRequestPayload,
  TranscriptionResult,
} from "../models/voice";

export class ElevenLabsService {
  private static instance: ElevenLabsService;

  static getInstance(): ElevenLabsService {
    if (!ElevenLabsService.instance) {
      ElevenLabsService.instance = new ElevenLabsService();
    }
    return ElevenLabsService.instance;
  }

  async transcribeAudio(payload: TranscriptionRequestPayload): Promise<TranscriptionResult> {
    if (!elevenLabsConfig.apiKey) {
      throw new Error("ElevenLabs API key missing. Set XI_API_KEY.");
    }

    const body = {
      audio_url: payload.audioUrl,
      model_id: payload.modelId ?? "universal-1",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      language: payload.language,
    };

    const response = await fetch(`${elevenLabsConfig.baseUrl}${elevenLabsConfig.speechToTextPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": elevenLabsConfig.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("ElevenLabs transcription failed", { status: response.status, errorText });
      throw new Error(`ElevenLabs transcription failed with status ${response.status}`);
    }

    const data = (await response.json()) as {
      text: string;
      confidence?: number;
      words?: TranscriptionResult["words"];
      [key: string]: unknown;
    };

    const result: TranscriptionResult = {
      text: data.text,
      raw: data,
    };

    if (typeof data.confidence === "number") {
      result.confidence = data.confidence;
    }

    if (Array.isArray(data.words)) {
      result.words = data.words;
    }

    return result;
  }

  async synthesizeSpeech(payload: SpeechSynthesisRequestPayload): Promise<SpeechSynthesisResult> {
    if (!elevenLabsConfig.apiKey) {
      throw new Error("ElevenLabs API key missing. Set XI_API_KEY.");
    }

    const modelId = payload.modelId ?? "eleven_flash_v2";

    const response = await fetch(
      `${elevenLabsConfig.baseUrl}${elevenLabsConfig.textToSpeechPath}/${payload.voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept": "audio/mpeg",
          "xi-api-key": elevenLabsConfig.apiKey,
        },
        body: JSON.stringify({
          text: payload.text,
          model_id: modelId,
          latencyOptimization: payload.latencyOptimization ?? "default",
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("ElevenLabs TTS failed", { status: response.status, errorText });
      throw new Error(`ElevenLabs TTS failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    const headers = Object.fromEntries(response.headers.entries());

    return {
      audioBase64,
      format: "mp3",
      raw: {
        modelId,
        headers,
      },
    };
  }

  verifyWebhookSignature(signatureHeader: string | undefined, payload: string): boolean {
    if (!elevenLabsConfig.webhookSecret) {
      logger.warn("Webhook secret not set; skipping signature verification");
      return true;
    }

    if (!signatureHeader) {
      return false;
    }

    const expected = crypto.createHmac("sha256", elevenLabsConfig.webhookSecret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  }
}

export const elevenLabsService = ElevenLabsService.getInstance();
