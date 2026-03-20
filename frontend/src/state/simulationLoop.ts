import { useSimulationStore } from "./simulationStore";
import type { InterpolatedVehicle } from "./simulationStore";
import { simulationWs } from "../services/websocket";
import { getInputState } from "../controllers/input";
import { PHYSICS } from "../models/types";
import type { VehicleType, NPCBehavior } from "../models/types";

const MPH_TO_MPS = 0.44704;

const MOCK_NPC_TYPES: VehicleType[] = ["sedan", "suv", "truck", "sports-car", "sedan", "suv"];
const MOCK_NPC_BEHAVIORS: NPCBehavior[] = ["cruiser", "aggressive", "defensive", "cruiser", "aggressive", "defensive"];
const MOCK_NPC_SPEEDS_MPH = [58, 72, 52, 80, 62, 55];
const MOCK_NPC_LANES = [0, 3, 1, 3, 0, 2];

let mockNpcsInitialized = false;

function initMockNpcs(): void {
  if (mockNpcsInitialized) return;
  mockNpcsInitialized = true;

  const store = useSimulationStore.getState();
  if (store.vehicles.length > 0) return;

  const playerZ = store.player.positionZ;
  const npcs: InterpolatedVehicle[] = MOCK_NPC_TYPES.map((type, i) => {
    const speedMph = MOCK_NPC_SPEEDS_MPH[i];
    const speedMps = speedMph * MPH_TO_MPS;
    const worldZ = playerZ + 40 + i * 70;
    return {
      id: `mock-npc-${i}`,
      type,
      laneIndex: MOCK_NPC_LANES[i],
      speedMph,
      speedMps,
      position: [0, 0, worldZ] as [number, number, number],
      heading: [0, 0, 1] as [number, number, number],
      behavior: MOCK_NPC_BEHAVIORS[i],
      prevPosition: [0, 0, worldZ] as [number, number, number],
      targetPosition: [0, 0, worldZ] as [number, number, number],
      interpolationT: 0,
    };
  });

  useSimulationStore.setState({ vehicles: npcs });
}

let mockNpcAccumulator = 0;
const MOCK_NPC_UPDATE_INTERVAL = 0.1;

function updateMockNpcs(dt: number): void {
  const store = useSimulationStore.getState();
  if (store.connected) return;

  mockNpcAccumulator += dt;
  if (mockNpcAccumulator < MOCK_NPC_UPDATE_INTERVAL) return;

  const elapsed = mockNpcAccumulator;
  mockNpcAccumulator = 0;

  const playerZ = store.player.positionZ;

  const updatedVehicles = store.vehicles.map((v) => {
    const newZ = v.position[2] + v.speedMps * elapsed;
    const distAhead = newZ - playerZ;

    let respawnedZ = newZ;
    if (distAhead > 500) {
      respawnedZ = playerZ - 200 - Math.random() * 100;
    } else if (distAhead < -300) {
      respawnedZ = playerZ + 200 + Math.random() * 200;
    }

    return {
      ...v,
      position: [v.position[0], 0, respawnedZ] as [number, number, number],
      prevPosition: v.position,
      targetPosition: [v.position[0], 0, respawnedZ] as [number, number, number],
    };
  });

  useSimulationStore.setState({ vehicles: updatedVehicles });
}

let animationFrameId: number | null = null;
let lastTickTime = 0;
let accumulator = 0;
let interpolationAlpha = 0;

function clientSidePrediction(dt: number): void {
  const store = useSimulationStore.getState();

  // When connected, server sends authoritative state at 60Hz — skip local physics
  if (store.connected) return;

  const player = store.player;
  const input = getInputState();
  const mission = store.mission;

  // Determine throttle/brake from either manual input or mission control
  let effectiveThrottle = input.throttle;
  let effectiveBrake = input.brake;
  const hasManualInput = input.throttle > 0 || input.brake > 0 || input.steering !== 0;

  if (!hasManualInput) {
    if (mission.mode === "cruise") {
      const targetMps = mission.cruiseTargetSpeedMph * MPH_TO_MPS;
      const speedError = targetMps - player.speedMps;
      if (speedError > 1.0) {
        effectiveThrottle = Math.min(1.0, speedError * 0.3);
        effectiveBrake = 0;
      } else if (speedError < -1.0) {
        effectiveThrottle = 0;
        effectiveBrake = Math.min(1.0, Math.abs(speedError) * 0.2);
      } else {
        effectiveThrottle = 0.05;
        effectiveBrake = 0;
      }
    } else if (mission.mode === "hold") {
      effectiveThrottle = 0;
      effectiveBrake = player.speedMps > 0.1 ? 0.3 : 0;
    } else if (mission.mode === "lane_change" || mission.mode === "overtake") {
      const targetMps = mission.cruiseTargetSpeedMph * MPH_TO_MPS;
      const speedError = targetMps - player.speedMps;
      if (speedError > 0.5) {
        effectiveThrottle = Math.min(1.0, speedError * 0.3);
        effectiveBrake = 0;
      } else if (speedError < -0.5) {
        effectiveThrottle = 0;
        effectiveBrake = Math.min(1.0, Math.abs(speedError) * 0.2);
      } else {
        effectiveThrottle = 0.05;
        effectiveBrake = 0;
      }
    }
  }

  const drag = PHYSICS.AERO_DRAG_COEFF * player.speedMps * player.speedMps;
  const rolling = player.speedMps > 0 ? PHYSICS.ROLLING_RESIST_MPS2 : 0;

  const throttleAccel = effectiveThrottle * 6.0;
  const brakeDecel = effectiveBrake * PHYSICS.BRAKE_RATE_MPH_PER_S * MPH_TO_MPS;

  const netAccel = throttleAccel - brakeDecel - drag - rolling;
  const maxSpeedMps = PHYSICS.MAX_SPEED_MPH * MPH_TO_MPS;
  const predictedSpeed = Math.min(
    maxSpeedMps,
    Math.max(0, player.speedMps + netAccel * dt)
  );
  const predictedZ = player.positionZ + predictedSpeed * dt;
  const predictedS = player.positionS + predictedSpeed * dt;

  const totalLength = store.routeGeometry?.totalLength ?? 4000;
  const clampedS = Math.min(predictedS, totalLength - 10);

  const steerInput = input.steering;
  const steerRate = PHYSICS.STEER_RATE_DEG_PER_S * dt;
  let newSteer = player.steerAngleDeg + steerInput * steerRate;
  if (steerInput === 0) {
    const returnRate = PHYSICS.STEER_RATE_DEG_PER_S * 0.5 * dt;
    if (Math.abs(newSteer) < returnRate) {
      newSteer = 0;
    } else {
      newSteer -= Math.sign(newSteer) * returnRate;
    }
  }
  newSteer = Math.max(-PHYSICS.MAX_STEER_DEG, Math.min(PHYSICS.MAX_STEER_DEG, newSteer));

  const lateralSpeed = (newSteer / PHYSICS.MAX_STEER_DEG) * predictedSpeed * 0.15;
  const newLateralOffset = player.lateralOffset + lateralSpeed * dt;

  const laneCount = store.routeGeometry?.laneCount ?? 4;
  const halfRoad = (laneCount * PHYSICS.LANE_WIDTH_METERS) / 2;
  const laneCenter = (player.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad;
  const absolutePos = laneCenter + newLateralOffset;

  let newLaneIndex = player.laneIndex;
  let newOffset = newLateralOffset;
  const laneBoundaryRight = laneCenter + PHYSICS.LANE_WIDTH_METERS / 2;
  const laneBoundaryLeft = laneCenter - PHYSICS.LANE_WIDTH_METERS / 2;

  if (absolutePos > laneBoundaryRight && newLaneIndex < laneCount - 1) {
    newLaneIndex++;
    const newCenter = (newLaneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad;
    newOffset = absolutePos - newCenter;
  } else if (absolutePos < laneBoundaryLeft && newLaneIndex > 0) {
    newLaneIndex--;
    const newCenter = (newLaneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad;
    newOffset = absolutePos - newCenter;
  }

  const maxOffset = PHYSICS.LANE_WIDTH_METERS * 0.5;
  newOffset = Math.max(-maxOffset, Math.min(maxOffset, newOffset));

  const gear = predictedSpeed < 5 * MPH_TO_MPS ? 1
    : predictedSpeed < 15 * MPH_TO_MPS ? 2
    : predictedSpeed < 30 * MPH_TO_MPS ? 3
    : predictedSpeed < 50 * MPH_TO_MPS ? 4
    : predictedSpeed < 75 * MPH_TO_MPS ? 5
    : 6;

  useSimulationStore.setState({
    player: {
      ...player,
      speedMps: predictedSpeed,
      speedMph: predictedSpeed / MPH_TO_MPS,
      positionZ: predictedZ,
      positionS: clampedS,
      steerAngleDeg: newSteer,
      lateralOffset: newOffset,
      laneIndex: newLaneIndex,
      gear,
    },
  });

  store.updateNavProgress(clampedS, newOffset);
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
    updateMockNpcs(PHYSICS.PHYSICS_DT);
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
  initMockNpcs();
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
