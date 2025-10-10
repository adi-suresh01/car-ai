import { apiClient } from "../services/apiClient";
import type {
  SimulationLayoutSummary,
  SimulationSnapshot,
  DrivingMissionState,
} from "../models/simulation";

class SimulationController {
  async fetchLayout(): Promise<SimulationLayoutSummary> {
    return apiClient.get<SimulationLayoutSummary>("/simulation/layout");
  }

  async fetchSnapshot(): Promise<SimulationSnapshot> {
    return apiClient.get<SimulationSnapshot>("/simulation/state");
  }

  async updateMission(payload: {
    speedMph?: number;
    gapMeters?: number;
    gapCars?: number;
    targetLane?: number | null;
    note?: string;
    source?: string;
    mode?: string;
    returnLane?: number | null;
    laneChangeDirection?: string;
  }): Promise<DrivingMissionState> {
    return apiClient.post<DrivingMissionState>("/simulation/mission", payload);
  }
}

export const simulationController = new SimulationController();
