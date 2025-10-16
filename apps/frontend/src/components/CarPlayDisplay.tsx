import { useMemo } from "react";
import { useSimulationStore } from "../state/useSimulationStore";

const CarPlayDisplay = () => {
  const speed = useSimulationStore((state) => state.player.speedMph);
  const mission = useSimulationStore((state) => state.mission);
  const voiceStatus = useSimulationStore((state) => state.voiceStatus);
  const collision = useSimulationStore((state) => state.collision);

  const cruiseSummary = useMemo(() => {
    if (mission.mode !== "cruise") return "Inactive";
    const mph = Math.round(mission.cruiseTargetSpeedMph ?? speed);
    const gapCars = ((mission.cruiseGapMeters ?? 9.2) / 4.6).toFixed(1);
    return `${mph} mph · ${gapCars} car gap`;
  }, [mission.mode, mission.cruiseTargetSpeedMph, mission.cruiseGapMeters, speed]);

  const laneSummary = useMemo(() => {
    if (mission.mode === "lane_change" && mission.targetLaneIndex != null) {
      return `Changing to lane ${mission.targetLaneIndex}`;
    }
    if (mission.mode === "overtake") {
      return mission.returnLaneIndex != null
        ? `Overtake, return lane ${mission.returnLaneIndex}`
        : "Overtake";
    }
    return "Stable";
  }, [mission.mode, mission.targetLaneIndex, mission.returnLaneIndex]);

  return (
    <div className="carplay-panel">
      <div className="carplay-row carplay-top">
        <div className="carplay-speed">
          <span className="carplay-speed-value">{Math.round(speed)}</span>
          <span className="carplay-speed-unit">mph</span>
        </div>
        <div className="carplay-mission">
          <h4>Cruise</h4>
          <p>{cruiseSummary}</p>
        </div>
        <div className={`carplay-status ${collision ? "alert" : "ok"}`}>
          {collision ? "Collision!" : "Autopilot Ready"}
        </div>
      </div>
      <div className="carplay-row carplay-bottom">
        <div className="carplay-lane">
          <h4>Lane Mode</h4>
          <p>{laneSummary}</p>
        </div>
        <div className="carplay-voice">
          <h4>Voice Command</h4>
          <p className="utterance">{voiceStatus?.lastUtterance ?? "Awaiting..."}</p>
          <p className="summary">{voiceStatus?.summary ?? ""}</p>
        </div>
      </div>
    </div>
  );
};

export default CarPlayDisplay;
