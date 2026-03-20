import { useSimulationStore } from "../../state/simulationStore";
import { useThrottledSelector } from "../../hooks/useThrottledStore";
import type { MissionMode } from "../../models/types";

const MODE_DISPLAY: Record<MissionMode, { label: string; color: string }> = {
  hold: { label: "HOLD", color: "#888" },
  cruise: { label: "CRUISE", color: "#00cc88" },
  lane_change: { label: "LANE CHANGE", color: "#ffaa00" },
  overtake: { label: "OVERTAKE", color: "#ff6644" },
};

export function MissionStatus() {
  const mission = useSimulationStore((s) => s.mission);
  const laneIndex = useThrottledSelector((s) => s.player.laneIndex, 200);
  const display = MODE_DISPLAY[mission.mode];

  return (
    <div className="hud-mission">
      <div className="mission-mode" style={{ color: display.color }}>
        {display.label}
      </div>
      <div className="mission-detail">
        <span className="mission-unit">Lane {laneIndex + 1}</span>
      </div>
      {mission.mode === "cruise" && (
        <div className="mission-detail">
          <span className="mission-target">{Math.round(mission.cruiseTargetSpeedMph)}</span>
          <span className="mission-unit">MPH target</span>
        </div>
      )}
      {mission.laneChangeDirection && (
        <div className="mission-detail">
          <span className="mission-direction">
            {mission.laneChangeDirection === "left" ? "<<<" : ">>>"} Lane{" "}
            {mission.targetLaneIndex}
          </span>
        </div>
      )}
    </div>
  );
}
