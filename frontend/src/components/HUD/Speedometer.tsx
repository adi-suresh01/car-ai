import { useThrottledSelector } from "../../hooks/useThrottledStore";

export function Speedometer() {
  const speedMph = useThrottledSelector((s) => s.player.speedMph, 100);
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
