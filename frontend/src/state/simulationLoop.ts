import { useSimulationStore } from "./simulationStore";
import { simulationWs } from "../services/websocket";
import { getInputState } from "../controllers/input";
import { PHYSICS } from "../models/types";

let animationFrameId: number | null = null;
let lastTickTime = 0;
let accumulator = 0;
let interpolationAlpha = 0;

function sendInput(): void {
  const input = getInputState();
  if (input.throttle > 0 || input.brake > 0 || input.steering !== 0) {
    simulationWs.send({
      type: "player_input",
      steering: input.steering,
      throttle: input.throttle,
      brake: input.brake,
    });
  }
}

function tick(now: number): void {
  if (lastTickTime === 0) {
    lastTickTime = now;
  }

  const frameTime = Math.min((now - lastTickTime) / 1000, 0.1);
  lastTickTime = now;
  accumulator += frameTime;

  while (accumulator >= PHYSICS.PHYSICS_DT) {
    sendInput();
    accumulator -= PHYSICS.PHYSICS_DT;
  }

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
  accumulator = 0;
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
