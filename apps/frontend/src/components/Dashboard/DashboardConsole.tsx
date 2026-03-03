import { useSimulationStore } from "../../state/simulationStore";

export function DashboardConsole() {
  const voiceHistory = useSimulationStore((s) => s.voiceHistory);

  return (
    <div className="dashboard-console">
      <div className="console-header">
        <span className="console-title">Voice Commands</span>
        <span className="console-count">{voiceHistory.length}</span>
      </div>
      <div className="console-list">
        {voiceHistory.length === 0 ? (
          <div className="console-empty">
            No voice commands yet. Say "cruise 65" to begin.
          </div>
        ) : (
          voiceHistory.map((entry) => (
            <div
              key={entry.id}
              className={`console-entry ${entry.success ? "success" : "failed"}`}
            >
              <div className="entry-utterance">"{entry.utterance}"</div>
              <div className="entry-interpreted">{entry.interpretedAs}</div>
              <div className="entry-time">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
