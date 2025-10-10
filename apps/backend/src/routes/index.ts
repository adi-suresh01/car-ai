import { Router } from "express";
import { simulationRoutes } from "./simulationRoutes";
import { voiceRoutes } from "./voiceRoutes";

const router = Router();

router.use("/simulation", simulationRoutes);
router.use("/voice", voiceRoutes);

export { router as apiRouter };
