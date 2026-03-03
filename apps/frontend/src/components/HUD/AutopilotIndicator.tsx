import { useSimulationStore } from "../../state/simulationStore";

export function AutopilotIndicator() {
  const enabled = useSimulationStore((s) => s.autopilotEnabled);
  const ready = useSimulationStore((s) => s.autopilotReady);
  const latencyMs = useSimulationStore((s) => s.autopilotLatencyMs);

  const statusClass = enabled ? "autopilot-active" : "autopilot-manual";
  const label = enabled ? "AUTOPILOT" : "MANUAL";
  const shortcutHint = ready ? "[P]" : "";

  return (
    <div className={`hud-autopilot ${statusClass}`}>
      <div className="autopilot-status">
        <div className={`autopilot-dot ${statusClass}`} />
        <span className="autopilot-label">{label}</span>
        {shortcutHint && (
          <span className="autopilot-shortcut">{shortcutHint}</span>
        )}
      </div>
      {enabled && latencyMs > 0 && (
        <div className="autopilot-latency">
          <span className="autopilot-latency-value">{latencyMs.toFixed(1)}</span>
          <span className="autopilot-latency-unit">ms</span>
        </div>
      )}
      {!ready && (
        <div className="autopilot-unavailable">Model not loaded</div>
      )}
    </div>
  );
}
