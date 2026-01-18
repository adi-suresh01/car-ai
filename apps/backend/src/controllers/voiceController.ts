import type { Request, Response } from "express";
import { elevenLabsService } from "../services/elevenLabsService";
import { fireworksService } from "../services/fireworksService";
import { SimulationService } from "../services/simulationService";
import { logger } from "../utils/logger";
import type { DrivingMissionSnapshot, DrivingMissionUpdate } from "../models/simulation";
import { parseVoiceMission } from "../utils/voiceCommandParser";
import { intentLogger } from "../utils/intentLogger";
import { mapIntentToMission } from "../utils/intentMissionMapper";

const MPS_TO_MPH = 1 / 0.44704;

class VoiceController {
  private readonly simulationService = SimulationService.getInstance();

  async transcribe(req: Request, res: Response) {
    const { audioUrl, modelId, language } = req.body ?? {};

    if (!audioUrl || typeof audioUrl !== "string") {
      res.status(400).json({ error: "audioUrl is required" });
      return;
    }

    try {
      const result = await elevenLabsService.transcribeAudio({ audioUrl, modelId, language });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async transcribeFile(req: Request, res: Response) {
    const contentType = req.header("content-type") ?? "audio/webm";
    const modelId = typeof req.query.modelId === "string" ? req.query.modelId : undefined;
    const language = typeof req.query.language === "string" ? req.query.language : undefined;
    const filename = typeof req.query.filename === "string" ? req.query.filename : undefined;

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
    if (!buffer || buffer.length === 0) {
      res.status(400).json({ error: "audio file payload is required" });
      return;
    }

    try {
      const result = await elevenLabsService.transcribeAudioFile({
        audioBuffer: buffer,
        mimeType: contentType,
        filename,
        modelId,
        language,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async synthesize(req: Request, res: Response) {
    const { text, voiceId, modelId, latencyOptimization } = req.body ?? {};

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }

    if (!voiceId || typeof voiceId !== "string") {
      res.status(400).json({ error: "voiceId is required" });
      return;
    }

    try {
      const result = await elevenLabsService.synthesizeSpeech({
        text,
        voiceId,
        modelId,
        latencyOptimization,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async inferIntent(req: Request, res: Response) {
    const { transcript, context } = req.body ?? {};

    if (!transcript || typeof transcript !== "string") {
      res.status(400).json({ error: "transcript is required" });
      return;
    }

    try {
      const result = await fireworksService.generateIntent({ transcript, context });
      const playerState = this.simulationService.getPlayerState();
      const laneCount = this.simulationService.getLaneCount();
      if (result.intent.operation === "takeExit" && result.intent.exitId) {
        const exists = this.simulationService.hasExit(result.intent.exitId);
        if (!exists) {
          res.status(400).json({ error: `Unknown exitId ${result.intent.exitId}`, intent: result.intent });
          return;
        }
      }
      const patch = mapIntentToMission(result.intent, {
        currentLaneIndex: playerState.laneIndex,
        laneCount,
      });

      if (!patch) {
        res.json(result);
        return;
      }

      try {
        const missionBefore = this.simulationService.getMission();
        const mission = this.simulationService.updateMission({
          ...patch,
          source: "intent",
        });
        const summary = this.buildVoiceSummary(mission, patch);
        this.simulationService.updateVoiceStatus({
          lastUtterance: transcript,
          summary,
          mode: mission.mode,
        });
        void intentLogger.log({
          timestamp: new Date().toISOString(),
          utterance: transcript,
          requestPayload: req.body,
          missionBefore,
          missionAfter: mission,
        });
        res.json({ ...result, mission, summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to apply intent";
        res.status(400).json({ error: message, intent: result.intent });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  handleWebhook(req: Request, res: Response) {
    const signature = req.header("x-eleven-signature");
    const payloadBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
    const payloadString = payloadBuffer.toString("utf8");

    const verified = elevenLabsService.verifyWebhookSignature(signature, payloadString);
    if (!verified) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    try {
      const event = JSON.parse(payloadString);
      logger.info("Received ElevenLabs webhook", { eventType: event?.type });
      res.status(200).json({ received: true });
    } catch (error) {
      logger.error("Failed to parse ElevenLabs webhook payload", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(400).json({ error: "Invalid JSON payload" });
    }
  }

  async command(req: Request, res: Response) {
    const { utterance } = req.body ?? {};
    if (!utterance || typeof utterance !== "string") {
      res.status(400).json({ error: "utterance is required" });
      return;
    }
    req.body = { ...req.body, source: "voice" };
    await this.applyMission(req, res);
  }

  reset(_req: Request, res: Response) {
    this.simulationService.updateVoiceStatus({});
    res.status(204).send();
  }

  async applyMission(req: Request, res: Response) {
    const {
      speedMph,
      gapMeters,
      gapCars,
      targetLane,
      note,
      utterance,
      source,
      rawIntent,
      mode,
      returnLane,
      laneChangeDirection,
    } = req.body ?? {};

    const patch: {
      cruiseTargetSpeedMph?: number;
      cruiseGapMeters?: number;
      targetLaneIndex?: number | null;
      returnLaneIndex?: number | null;
      laneChangeDirection?: "left" | "right" | null;
      mode?: "hold" | "cruise" | "lane_change" | "overtake";
      source?: "voice" | "intent";
      note?: string;
    } = {};
    const supplementaryNotes: string[] = [];

    const missionBefore = this.simulationService.getMission();
    const utteranceText = typeof utterance === "string" ? utterance : "";

    const playerState = this.simulationService.getPlayerState();
    const laneCount = this.simulationService.getLaneCount();
    const currentSpeedMph = Number.isFinite(playerState.speedMph)
      ? playerState.speedMph
      : (playerState.speedMps ?? 0) * MPS_TO_MPH;

    if (typeof utterance === "string" && utterance.trim().length > 0) {
      const parsed = parseVoiceMission(utterance, {
        currentSpeedMph,
        currentLaneIndex: playerState.laneIndex,
        laneCount,
      });
      if (parsed) {
        Object.assign(patch, parsed.update);
        if (parsed.note) {
          supplementaryNotes.push(parsed.note);
        }
      }
    }

    if (speedMph !== undefined) {
      const parsed = Number(speedMph);
      if (!Number.isFinite(parsed)) {
        res.status(400).json({ error: "speedMph must be numeric" });
        return;
      }
      patch.cruiseTargetSpeedMph = parsed;
      patch.mode = patch.mode ?? "cruise";
      supplementaryNotes.push(`Override: cruise speed ${parsed} mph`);
    }

    if (gapMeters !== undefined || gapCars !== undefined) {
      const metersValue =
        gapMeters !== undefined ? Number(gapMeters) : Number(gapCars) * 4.6;
      if (!Number.isFinite(metersValue)) {
        res.status(400).json({ error: "gapMeters or gapCars must be numeric" });
        return;
      }
      patch.cruiseGapMeters = metersValue;
      patch.mode = patch.mode ?? "cruise";
      if (gapCars !== undefined) {
        supplementaryNotes.push(`Override: gap ${gapCars} cars`);
      }
    }

    if (targetLane !== undefined) {
      if (targetLane === null || targetLane === "null") {
        patch.targetLaneIndex = null;
      } else {
        const parsed = Number(targetLane);
        if (Number.isInteger(parsed)) {
          patch.targetLaneIndex = parsed;
          supplementaryNotes.push(`Override: target lane ${parsed}`);
        } else {
          supplementaryNotes.push(`Ignored targetLane value '${targetLane}' (non-integer)`);
        }
      }
    }

    if (mode !== undefined) {
      const normalizedMode = String(mode);
      const validModes = ["hold", "cruise", "lane_change", "overtake"] as const;
      if (validModes.includes(normalizedMode as (typeof validModes)[number])) {
        patch.mode = normalizedMode as (typeof validModes)[number];
        supplementaryNotes.push(`Override: mode ${normalizedMode}`);
      } else {
        supplementaryNotes.push(`Ignored mode value '${mode}'`);
      }
    }

    if (returnLane !== undefined) {
      if (returnLane === null || returnLane === "null") {
        patch.returnLaneIndex = null;
      } else {
        const parsed = Number(returnLane);
        if (Number.isInteger(parsed)) {
          patch.returnLaneIndex = parsed;
          supplementaryNotes.push(`Override: return lane ${parsed}`);
        } else {
          supplementaryNotes.push(`Ignored returnLane value '${returnLane}'`);
        }
      }
    }

    if (laneChangeDirection !== undefined) {
      const normalized = String(laneChangeDirection);
      if (normalized === "left" || normalized === "right") {
        patch.laneChangeDirection = normalized as "left" | "right";
        supplementaryNotes.push(`Override: lane change direction ${normalized}`);
      } else {
        supplementaryNotes.push(`Ignored laneChangeDirection value '${laneChangeDirection}'`);
      }
    }

    if (source === "intent") {
      patch.source = "intent";
    } else {
      patch.source = "voice";
    }

    const notePieces: string[] = [];
    if (note && typeof note === "string") {
      notePieces.push(note);
    }
    if (utterance && typeof utterance === "string") {
      notePieces.push(`Utterance: ${utterance}`);
    }
    if (rawIntent) {
      notePieces.push(`Intent: ${JSON.stringify(rawIntent)}`);
    }
    if (supplementaryNotes.length > 0) {
      notePieces.push(...supplementaryNotes);
    }
    if (notePieces.length > 0) {
      patch.note = notePieces.join(" | ");
    }

    if (patch.mode === "cruise" && patch.cruiseTargetSpeedMph === undefined) {
      patch.cruiseTargetSpeedMph = currentSpeedMph;
    }
    if (patch.mode === "cruise" && patch.cruiseGapMeters === undefined) {
      patch.cruiseGapMeters = 2 * 4.6;
    }

    const meaningfulKeys: Array<keyof typeof patch> = [
      "cruiseTargetSpeedMph",
      "cruiseGapMeters",
      "targetLaneIndex",
      "returnLaneIndex",
      "laneChangeDirection",
      "mode",
    ];
    const hasMeaningfulUpdate = meaningfulKeys.some((key) => patch[key] !== undefined);

    if (!hasMeaningfulUpdate) {
      const infoSummary = this.handleInformationalCommand(utteranceText, missionBefore, req.body);
      if (infoSummary) {
        res.json({ mission: missionBefore, summary: infoSummary });
        return;
      }
      res.status(400).json({ error: "No actionable mission parameters provided" });
      return;
    }

    try {
      const mission = this.simulationService.updateMission(patch);
      const summary = this.buildVoiceSummary(mission, patch);
      this.simulationService.updateVoiceStatus({
        lastUtterance: utteranceText,
        summary,
        mode: mission.mode,
      });
      void intentLogger.log({
        timestamp: new Date().toISOString(),
        utterance: utteranceText,
        requestPayload: req.body,
        missionBefore,
        missionAfter: mission,
      });
      res.json({ mission, summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply mission";
      logger.error("Voice mission update failed", { error: message });
      res.status(400).json({ error: message });
    }
  }

  private buildVoiceSummary(mission: DrivingMissionSnapshot, patch: DrivingMissionUpdate): string {
    switch (mission.mode) {
      case "cruise": {
        const mph = mission.cruiseTargetSpeedMph.toFixed(0);
        const gapCars = (mission.cruiseGapMeters / 4.6).toFixed(1);
        return `Cruise ${mph} mph, gap ${gapCars} cars`;
      }
      case "lane_change": {
        if (mission.targetLaneIndex != null) {
          return `Changing to lane ${mission.targetLaneIndex + 1}`;
        }
        return "Lane change initiated";
      }
      case "overtake":
        return "Overtake maneuver in progress";
      default:
        return patch.note ?? "Mission updated";
    }
  }

  private handleInformationalCommand(
    utterance: string,
    mission: DrivingMissionSnapshot,
    requestPayload: unknown,
  ): string | null {
    const normalized = utterance.toLowerCase().trim();
    if (!normalized) {
      return null;
    }

    if (normalized.includes("cop") || normalized.includes("police")) {
      const summary = "No police reported within the next 10 miles.";
      this.simulationService.updateVoiceStatus({
        lastUtterance: utterance,
        summary,
        mode: mission.mode,
      });
      void intentLogger.log({
        timestamp: new Date().toISOString(),
        utterance,
        requestPayload,
        missionBefore: mission,
        missionAfter: mission,
      });
      return summary;
    }

    if (normalized.includes("traffic") || normalized.includes("slowdown")) {
      const summary = "Moderate traffic 2 miles ahead. Estimated delay: 4 minutes.";
      this.simulationService.updateVoiceStatus({
        lastUtterance: utterance,
        summary,
        mode: mission.mode,
      });
      void intentLogger.log({
        timestamp: new Date().toISOString(),
        utterance,
        requestPayload,
        missionBefore: mission,
        missionAfter: mission,
      });
      return summary;
    }

    if (normalized.includes("hazard") || normalized.includes("accident") || normalized.includes("debris")) {
      const summary = "No reported hazards within the next 5 miles.";
      this.simulationService.updateVoiceStatus({
        lastUtterance: utterance,
        summary,
        mode: mission.mode,
      });
      void intentLogger.log({
        timestamp: new Date().toISOString(),
        utterance,
        requestPayload,
        missionBefore: mission,
        missionAfter: mission,
      });
      return summary;
    }

    if (normalized.includes("camera")) {
      const summary = "Speed camera reported 5.1 miles ahead.";
      this.simulationService.updateVoiceStatus({
        lastUtterance: utterance,
        summary,
        mode: mission.mode,
      });
      void intentLogger.log({
        timestamp: new Date().toISOString(),
        utterance,
        requestPayload,
        missionBefore: mission,
        missionAfter: mission,
      });
      return summary;
    }

    if (normalized.includes("exit") || normalized.includes("offramp")) {
      const summary = "Next exit in 1.2 miles: Embarcadero.";
      this.simulationService.updateVoiceStatus({
        lastUtterance: utterance,
        summary,
        mode: mission.mode,
      });
      void intentLogger.log({
        timestamp: new Date().toISOString(),
        utterance,
        requestPayload,
        missionBefore: mission,
        missionAfter: mission,
      });
      return summary;
    }

    return null;
  }
}

export const voiceController = new VoiceController();
