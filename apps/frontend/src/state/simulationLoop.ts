import { useSimulationStore } from "./simulationStore";
import { simulationWs } from "../services/websocket";
import { PHYSICS } from "../models/types";

const MPH_TO_MPS = 0.44704;

let animationFrameId: number | null = null;
let lastTickTime = 0;
let accumulator = 0;
let interpolationAlpha = 0;

function clientSidePrediction(dt: number): void {
  const store = useSimulationStore.getState();
  const player = store.player;

  if (player.speedMps <= 0) return;

  const drag = PHYSICS.AERO_DRAG_COEFF * player.speedMps * player.speedMps;
  const decel = PHYSICS.ROLLING_RESIST_MPS2 + drag;
  const predictedSpeed = Math.max(0, player.speedMps - decel * dt);
  const predictedZ = player.positionZ + predictedSpeed * dt;

  useSimulationStore.setState({
    player: {
      ...player,
      speedMps: predictedSpeed,
      speedMph: predictedSpeed / MPH_TO_MPS,
      positionZ: predictedZ,
    },
  });
}

function tick(now: number): void {
  if (lastTickTime === 0) {
    lastTickTime = now;
  }

  const frameTime = Math.min((now - lastTickTime) / 1000, 0.1);
  lastTickTime = now;
  accumulator += frameTime;

  while (accumulator >= PHYSICS.PHYSICS_DT) {
    clientSidePrediction(PHYSICS.PHYSICS_DT);
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
