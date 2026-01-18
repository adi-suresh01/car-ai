import { useState } from "react";
import { useVoiceCommand } from "../controllers/useVoiceCommand";
import { useVoiceCapture } from "../controllers/useVoiceCapture";
import { apiClient } from "../services/apiClient";

const VoiceDebugPanel = () => {
  const enabled = import.meta.env.VITE_SHOW_VOICE_DEBUG === "true";
  const { sendCommand, isSending, lastSummary, error } = useVoiceCommand();
  const {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    lastTranscript,
    error: captureError,
  } = useVoiceCapture();
  const [utterance, setUtterance] = useState("");

  if (!enabled) {
    return null;
  }

  const handleSubmit = async () => {
    if (!utterance.trim()) return;
    await sendCommand(utterance.trim());
    setUtterance("");
  };

  const handleReset = async () => {
    await apiClient.post<void>("/voice/reset");
  };

  return (
    <div className="voice-debug-panel">
      <div className="voice-debug-header">Voice Debug</div>
      <div className="voice-debug-body">
        <input
          type="text"
          value={utterance}
          placeholder="Type a voice command"
          onChange={(event) => setUtterance(event.target.value)}
        />
        <button type="button" onClick={handleSubmit} disabled={isSending}>
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
      <div className="voice-debug-controls">
        <button type="button" onClick={isRecording ? stopRecording : startRecording} disabled={isTranscribing}>
          {isRecording ? "Stop Recording" : "Record Voice"}
        </button>
        {isTranscribing ? <span>Transcribing…</span> : null}
      </div>
      {lastTranscript ? <div className="voice-debug-summary">Transcript: {lastTranscript}</div> : null}
      <button className="voice-debug-reset" type="button" onClick={handleReset}>
        Reset Voice Status
      </button>
      {lastSummary ? <div className="voice-debug-summary">{lastSummary}</div> : null}
      {error || captureError ? <div className="voice-debug-error">{error ?? captureError}</div> : null}
    </div>
  );
};

export default VoiceDebugPanel;
