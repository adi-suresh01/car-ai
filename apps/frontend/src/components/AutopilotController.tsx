import { useEffect, useRef } from "react";
import { useSimulationStore } from "../state/useSimulationStore";

const LANE_WIDTH = 3.6;
const CAR_LENGTH = 4.6;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const resolveLaneCenters = (laneCenters: number[], laneCount: number): number[] => {
  if (laneCenters.length > 0) {
    return laneCenters;
  }
  const count = laneCount || 5;
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, idx) => (idx - mid) * LANE_WIDTH);
};

const computeAutopilotControl = () => {
  const state = useSimulationStore.getState();
  const { player, npcVehicles, mission, laneCenters, laneProfiles, collision } = state;

  const centers = resolveLaneCenters(laneCenters, laneProfiles.length);
  const clampIndex = (index: number) => clamp(Math.round(index), 0, centers.length - 1);
  const targetLaneIndex = clampIndex(mission.targetLaneIndex ?? player.laneIndex);
  const currentLaneCenter = centers[clampIndex(player.laneIndex)] ?? 0;
  const targetLaneCenter = centers[targetLaneIndex] ?? currentLaneCenter;

  const playerWorldX = currentLaneCenter + player.lateralOffset;
  const laneError = targetLaneCenter - playerWorldX;
  const steering = clamp(laneError / (LANE_WIDTH * 0.5), -1, 1);

  const defaultTargetSpeed = Math.max(player.speedMph, 35);
  let desiredSpeed = mission.mode === "cruise"
    ? mission.cruiseTargetSpeedMph ?? defaultTargetSpeed
    : defaultTargetSpeed;

  const gapTarget = mission.cruiseGapMeters ?? CAR_LENGTH * 2;
  const laneVehicles = npcVehicles.filter((vehicle) => vehicle.laneIndex === player.laneIndex && vehicle.position);
  const ahead = laneVehicles
    .filter((vehicle) => (vehicle.position?.[2] ?? -Infinity) > player.positionZ)
    .sort((a, b) => (a.position![2] - b.position![2]))[0];

  if (ahead) {
    const gap = ahead.position![2] - player.positionZ - CAR_LENGTH;
    const aheadSpeed = ahead.speedMph ?? player.speedMph;
    if (gap < gapTarget) {
      desiredSpeed = Math.min(desiredSpeed, Math.max(aheadSpeed - 3, 20));
    }
  }

  const speedError = desiredSpeed - player.speedMph;
  let throttle = 0;
  let brake = 0;

  if (collision) {
    throttle = 0;
    brake = 1;
  } else if (speedError > 0.8) {
    throttle = clamp(speedError / 18, 0.12, 0.9);
  } else if (speedError < -0.8) {
    brake = clamp(-speedError / 12, 0.15, 1);
  } else {
    throttle = Math.max(0.08, Math.min(0.2, throttle));
  }

  return { steering, throttle, brake };
};

const AutopilotController = ({ enabled = true }: { enabled?: boolean }) => {
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return () => undefined;
    }

    const loop = () => {
      const action = computeAutopilotControl();
      useSimulationStore.getState().updateControlInput({
        steering: action.steering,
        throttle: action.throttle,
        brake: action.brake,
      });
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [enabled]);

  return null;
};

export default AutopilotController;
