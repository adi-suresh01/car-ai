import { Request, Response } from "express";
import type {
  DrivingMissionUpdate,
  MissionSource,
  PlayerSnapshot,
  TrafficBehaviorProfile,
} from "../models/simulation";
import { SimulationService } from "../services/simulationService";

class SimulationController {
  private readonly service = SimulationService.getInstance();
  private static readonly CAR_LENGTH_METERS = 4.6;

  getLayout = (_req: Request, res: Response) => {
    const layout = this.service.getLayoutSummary();
    res.json(layout);
  };

  getSnapshot = (_req: Request, res: Response) => {
    const snapshot = this.service.getSnapshot();
    res.json(snapshot);
  };

  resetTraffic = (_req: Request, res: Response) => {
    this.service.resetTraffic();
    res.status(204).send();
  };

  spawnVehicle = (req: Request, res: Response) => {
    const { laneIndex, speedMph, positionZ, type, behavior } = req.body as {
      laneIndex?: number;
      speedMph?: number;
      positionZ?: number;
      type?: PlayerSnapshot["type"];
      behavior?: TrafficBehaviorProfile;
    };

    if (laneIndex === undefined || Number.isNaN(Number(laneIndex))) {
      res.status(400).json({ error: "laneIndex is required" });
      return;
    }

    try {
      const payload: {
        laneIndex: number;
        speedMph?: number;
        positionZ?: number;
        type?: PlayerSnapshot["type"];
        behavior?: TrafficBehaviorProfile;
      } = { laneIndex };

      if (speedMph !== undefined) payload.speedMph = speedMph;
      if (positionZ !== undefined) payload.positionZ = positionZ;
      if (type !== undefined) payload.type = type;
      if (behavior !== undefined) payload.behavior = behavior;

      const id = this.service.spawnVehicle(payload);
      res.status(201).json({ id });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to spawn vehicle" });
    }
  };

  updatePlayer = (req: Request, res: Response) => {
    const payload = req.body as Partial<PlayerSnapshot> & { positionZ?: number };
    this.service.updatePlayerState(payload);
    res.status(204).send();
  };

  getMission = (_req: Request, res: Response) => {
    const mission = this.service.getMission();
    res.json(mission);
  };

  updateMission = (req: Request, res: Response) => {
    const { speedMph, gapMeters, gapCars, targetLane, note, source, mode, returnLane, laneChangeDirection } =
      req.body ?? {};

    const patch: DrivingMissionUpdate = {};

    if (speedMph !== undefined) {
      const parsed = Number(speedMph);
      if (!Number.isFinite(parsed)) {
        res.status(400).json({ error: "speedMph must be a number" });
        return;
      }
      patch.cruiseTargetSpeedMph = parsed;
    }

    if (gapMeters !== undefined || gapCars !== undefined) {
      const metersValue =
        gapMeters !== undefined
          ? Number(gapMeters)
          : Number(gapCars) * SimulationController.CAR_LENGTH_METERS;
      if (!Number.isFinite(metersValue)) {
        res.status(400).json({ error: "gapMeters or gapCars must be numeric" });
        return;
      }
      patch.cruiseGapMeters = metersValue;
    }

    if (targetLane !== undefined) {
      if (targetLane === null || targetLane === "null") {
        patch.targetLaneIndex = null;
      } else {
        const parsed = Number(targetLane);
        if (!Number.isInteger(parsed)) {
          res.status(400).json({ error: "targetLane must be an integer or null" });
          return;
        }
        patch.targetLaneIndex = parsed;
      }
    }

    if (source !== undefined) {
      const normalized = String(source) as MissionSource;
      const validSources: MissionSource[] = ["system", "manual", "voice", "intent", "rl"];
      if (!validSources.includes(normalized)) {
        res.status(400).json({ error: `source must be one of ${validSources.join(", ")}` });
        return;
      }
      patch.source = normalized;
    } else {
      patch.source = "manual";
    }

    if (mode !== undefined) {
      const normalizedMode = String(mode);
      const validModes = ["hold", "cruise", "lane_change", "overtake"] as const;
      if (!validModes.includes(normalizedMode as (typeof validModes)[number])) {
        res.status(400).json({ error: `mode must be one of ${validModes.join(", ")}` });
        return;
      }
      patch.mode = normalizedMode as (typeof validModes)[number];
    }

    if (returnLane !== undefined) {
      if (returnLane === null || returnLane === "null") {
        patch.returnLaneIndex = null;
      } else {
        const parsed = Number(returnLane);
        if (!Number.isInteger(parsed)) {
          res.status(400).json({ error: "returnLane must be an integer or null" });
          return;
        }
        patch.returnLaneIndex = parsed;
      }
    }

    if (laneChangeDirection !== undefined) {
      const normalizedDirection = String(laneChangeDirection);
      if (normalizedDirection !== "left" && normalizedDirection !== "right") {
        res.status(400).json({ error: "laneChangeDirection must be 'left' or 'right'" });
        return;
      }
      patch.laneChangeDirection = normalizedDirection as "left" | "right";
    }

    if (note !== undefined) {
      if (typeof note !== "string") {
        res.status(400).json({ error: "note must be a string" });
        return;
      }
      patch.note = note;
    }

    try {
      const mission = this.service.updateMission(patch);
      res.status(200).json(mission);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update mission";
      res.status(400).json({ error: message });
    }
  };
}

export const simulationController = new SimulationController();
