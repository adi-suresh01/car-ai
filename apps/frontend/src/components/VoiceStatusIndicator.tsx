import { useSimulationStore } from "../state/useSimulationStore";

const VoiceStatusIndicator = () => {
  const voiceListeningEnabled = useSimulationStore((state) => state.voiceListeningEnabled);
  const status = useSimulationStore((state) => state.voiceCaptureStatus);

  if (!voiceListeningEnabled) {
    return null;
  }

  const label = status === "recording" ? "Listening" : status === "transcribing" ? "Transcribing" : "Idle";

  return (
    <div className={`voice-status-indicator voice-status-${status}`}>
      <span className="voice-status-dot" />
      <span>{label}</span>
    </div>
  );
};

export default VoiceStatusIndicator;
