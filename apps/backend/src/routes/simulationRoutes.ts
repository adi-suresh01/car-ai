import { Router } from "express";
import { simulationController } from "../controllers/simulationController";

const router = Router();

router.get("/layout", simulationController.getLayout);
router.get("/state", simulationController.getSnapshot);
router.get("/mission", simulationController.getMission);
router.post("/traffic/reset", simulationController.resetTraffic);
router.post("/traffic/spawn", simulationController.spawnVehicle);
router.post("/player", simulationController.updatePlayer);
router.post("/mission", simulationController.updateMission);

export { router as simulationRoutes };
