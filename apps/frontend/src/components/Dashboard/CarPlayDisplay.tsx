import { useSimulationStore } from "../../state/simulationStore";

export function CarPlayDisplay() {
  const mission = useSimulationStore((s) => s.mission);
  const player = useSimulationStore((s) => s.player);
  const connected = useSimulationStore((s) => s.connected);

  return (
    <div className="carplay-display">
      <div className="carplay-header">
        <div className="carplay-title">VoiceDrive</div>
        <div className={`carplay-status ${connected ? "connected" : "disconnected"}`}>
          {connected ? "Connected" : "Offline"}
        </div>
      </div>

      <div className="carplay-nav">
        <div className="nav-card">
          <div className="nav-label">Current Lane</div>
          <div className="nav-value">{player.laneIndex + 1}</div>
        </div>
        <div className="nav-card">
          <div className="nav-label">Distance</div>
          <div className="nav-value">{(player.positionZ / 1000).toFixed(1)} km</div>
        </div>
        <div className="nav-card">
          <div className="nav-label">Mode</div>
          <div className="nav-value nav-mode">{mission.mode.replace("_", " ")}</div>
        </div>
      </div>

      <div className="carplay-controls">
        <div className="control-row">
          <span className="control-label">Cruise Target</span>
          <span className="control-value">{mission.cruiseTargetSpeedMph} mph</span>
        </div>
        <div className="control-row">
          <span className="control-label">Gap Distance</span>
          <span className="control-value">{mission.cruiseGapMeters} m</span>
        </div>
        <div className="control-row">
          <span className="control-label">Command Source</span>
          <span className="control-value">{mission.source}</span>
        </div>
      </div>
    </div>
  );
}
