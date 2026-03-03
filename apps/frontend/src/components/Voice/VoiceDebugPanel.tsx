import { useSimulationStore } from "../../state/simulationStore";

export function VoiceDebugPanel() {
  const voiceActive = useSimulationStore((s) => s.voiceActive);
  const voiceLevel = useSimulationStore((s) => s.voiceLevel);
  const connected = useSimulationStore((s) => s.connected);
  const voiceHistory = useSimulationStore((s) => s.voiceHistory);

  return (
    <div className="voice-debug-panel">
      <h3>Voice Debug</h3>
      <div className="debug-row">
        <span>Mic Active:</span>
        <span className={voiceActive ? "status-on" : "status-off"}>
          {voiceActive ? "Recording" : "Idle"}
        </span>
      </div>
      <div className="debug-row">
        <span>Level:</span>
        <div className="debug-level-bar">
          <div
            className="debug-level-fill"
            style={{ width: `${voiceLevel * 100}%` }}
          />
        </div>
      </div>
      <div className="debug-row">
        <span>WebSocket:</span>
        <span className={connected ? "status-on" : "status-off"}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="debug-history">
        <h4>Recent ({voiceHistory.length})</h4>
        {voiceHistory.slice(0, 5).map((entry) => (
          <div key={entry.id} className="debug-entry">
            <span className="debug-utterance">"{entry.utterance}"</span>
          </div>
        ))}
      </div>
    </div>
  );
}
