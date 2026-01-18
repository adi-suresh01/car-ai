import fs from "fs";
import path from "path";
import type { DrivingMissionMode } from "../models/simulation";

export interface ScenarioConfig {
  id: string;
  seed?: number;
  mission?: {
    mode?: DrivingMissionMode;
    cruiseTargetSpeedMph?: number;
    cruiseGapMeters?: number;
    targetLaneIndex?: number | null;
  };
}

export const loadScenario = (scenarioId: string): ScenarioConfig | null => {
  const scenarioPath = path.resolve(process.cwd(), "..", "..", "data", "scenarios", `${scenarioId}.json`);
  if (!fs.existsSync(scenarioPath)) {
    return null;
  }
  const raw = fs.readFileSync(scenarioPath, "utf8");
  const parsed = JSON.parse(raw) as ScenarioConfig;
  if (!parsed || typeof parsed.id !== "string") {
    return null;
  }
  return parsed;
};
