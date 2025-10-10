import { Router } from "express";
import { voiceController } from "../controllers/voiceController";

const router = Router();

router.post("/transcriptions", (req, res) => voiceController.transcribe(req, res));
router.post("/synthesize", (req, res) => voiceController.synthesize(req, res));
router.post("/intent", (req, res) => voiceController.inferIntent(req, res));
router.post("/webhooks/elevenlabs", (req, res) => voiceController.handleWebhook(req, res));
router.post("/mission", (req, res) => voiceController.applyMission(req, res));

export { router as voiceRoutes };
