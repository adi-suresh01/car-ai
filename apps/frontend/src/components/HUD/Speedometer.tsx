import { useSimulationStore } from "../../state/simulationStore";

export function Speedometer() {
  const speedMph = useSimulationStore((s) => s.player.speedMph);
  const displaySpeed = Math.round(speedMph);

  return (
    <div className="hud-speedometer">
      <div className="speed-value">{displaySpeed}</div>
      <div className="speed-unit">MPH</div>
      <div className="speed-bar-container">
        <div
          className="speed-bar-fill"
          style={{ width: `${Math.min(100, (speedMph / 120) * 100)}%` }}
        />
      </div>
    </div>
  );
}
