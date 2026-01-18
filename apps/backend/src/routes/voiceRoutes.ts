import { Router } from "express";
import { voiceController } from "../controllers/voiceController";

const router = Router();

router.post("/transcriptions", (req, res) => voiceController.transcribe(req, res));
router.post("/transcriptions/file", (req, res) => voiceController.transcribeFile(req, res));
router.post("/synthesize", (req, res) => voiceController.synthesize(req, res));
router.post("/intent", (req, res) => voiceController.inferIntent(req, res));
router.post("/webhooks/elevenlabs", (req, res) => voiceController.handleWebhook(req, res));
router.post("/mission", (req, res) => voiceController.applyMission(req, res));
router.post("/command", (req, res) => voiceController.command(req, res));
router.post("/reset", (req, res) => voiceController.reset(req, res));

export { router as voiceRoutes };
