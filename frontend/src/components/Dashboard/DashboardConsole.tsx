import { useState, useRef } from "react";
import { useSimulationStore } from "../../state/simulationStore";
import { simulationWs } from "../../services/websocket";
import { sendVoiceCommand } from "../../services/api";
import { parseAndApplyVoiceCommand } from "../../controllers/voiceParser";

export function DashboardConsole() {
  const voiceHistory = useSimulationStore((s) => s.voiceHistory);
  const [cmdInput, setCmdInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = cmdInput.trim();
    if (!text) return;

    // Send via WS to backend for real-time processing
    simulationWs.sendVoiceCommand(text);

    // Also send via REST API as fallback
    sendVoiceCommand(text).catch(() => {
      // Backend unavailable, local parsing handles it
    });

    // Parse locally for immediate response (works offline too)
    parseAndApplyVoiceCommand(text);

    useSimulationStore.getState().addVoiceCommand({
      id: `cmd-${Date.now()}`,
      utterance: text,
      interpretedAs: text,
      timestamp: Date.now(),
      success: true,
    });

    setCmdInput("");
  }

  return (
    <div className="dashboard-console">
      <div className="console-header">
        <span className="console-title">Voice Commands</span>
        <span className="console-count">{voiceHistory.length}</span>
      </div>
      <form className="console-input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="console-text-input"
          placeholder='Type command... ("cruise 65")'
          value={cmdInput}
          onChange={(e) => setCmdInput(e.target.value)}
        />
        <button type="submit" className="console-send-btn" disabled={!cmdInput.trim()}>
          Go
        </button>
      </form>
      <div className="console-list">
        {voiceHistory.length === 0 ? (
          <div className="console-empty">
            Say or type "cruise 65" to begin.
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
