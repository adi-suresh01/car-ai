import { useSimulationStore } from "../../state/simulationStore";

export function VoiceIndicator() {
  const voiceActive = useSimulationStore((s) => s.voiceActive);
  const voiceLevel = useSimulationStore((s) => s.voiceLevel);

  const bars = 5;
  const activeBarCount = Math.ceil(voiceLevel * bars);

  return (
    <div className={`hud-voice ${voiceActive ? "active" : ""}`}>
      <div className="voice-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </div>
      <div className="voice-bars">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`voice-bar ${i < activeBarCount && voiceActive ? "active" : ""}`}
            style={{ height: `${40 + i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}
