import { useSimulationStore } from "./simulationStore";
import { simulationWs } from "../services/websocket";
import { PHYSICS } from "../models/types";

let animationFrameId: number | null = null;
let lastTickTime = 0;
let interpolationAlpha = 0;

function tick(now: number): void {
  if (lastTickTime === 0) {
    lastTickTime = now;
  }

  const frameTime = Math.min((now - lastTickTime) / 1000, 0.1);
  lastTickTime = now;

  interpolationAlpha = Math.min(
    1,
    interpolationAlpha + frameTime * PHYSICS.PHYSICS_HZ
  );
  useSimulationStore.getState().interpolateVehicles(interpolationAlpha);

  animationFrameId = requestAnimationFrame(tick);
}

export function startSimulationLoop(): void {
  simulationWs.connect();
  lastTickTime = 0;
  interpolationAlpha = 0;
  animationFrameId = requestAnimationFrame(tick);
}

export function stopSimulationLoop(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  simulationWs.disconnect();
}

export function resetInterpolation(): void {
  interpolationAlpha = 0;
}
