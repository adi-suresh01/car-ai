import { useCallback, useMemo, useRef, useState } from "react";
import { apiClient } from "../services/apiClient";

interface VoiceCaptureOptions {
  commandEndpoint?: string;
  transcriptionEndpoint?: string;
  modelId?: string;
  language?: string;
  segmentMs?: number;
}

export const useVoiceCapture = (options: VoiceCaptureOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enabled, setEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const loopTimeoutRef = useRef<number | null>(null);

  const transcriptionEndpoint = options.transcriptionEndpoint ?? "/voice/transcriptions/file";
  const commandEndpoint = options.commandEndpoint ?? "/voice/command";
  const segmentMs = options.segmentMs ?? 2600;

  const clearLoopTimeout = () => {
    if (loopTimeoutRef.current) {
      window.clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
  };

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError(undefined);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      setIsRecording(false);
      setIsTranscribing(true);
      try {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"}${transcriptionEndpoint}?modelId=${options.modelId ?? ""}&language=${options.language ?? ""}`,
          {
            method: "POST",
            headers: { "Content-Type": recorder.mimeType },
            body: arrayBuffer,
          },
        );
        if (!response.ok) {
          throw new Error(`Transcription failed with status ${response.status}`);
        }
        const data = (await response.json()) as { text: string };
        if (!data.text) {
          throw new Error("Transcription response missing text");
        }
        setLastTranscript(data.text);
        await apiClient.post(commandEndpoint, { utterance: data.text });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Voice capture failed";
        setError(message);
      } finally {
        setIsTranscribing(false);
        chunksRef.current = [];
        recorder.stream.getTracks().forEach((track) => track.stop());
        if (enabled) {
          clearLoopTimeout();
          loopTimeoutRef.current = window.setTimeout(() => {
            void startRecording();
          }, 180);
        }
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    clearLoopTimeout();
    loopTimeoutRef.current = window.setTimeout(() => {
      stopRecording();
    }, segmentMs);
  }, [commandEndpoint, transcriptionEndpoint, options.language, options.modelId, segmentMs, enabled, stopRecording]);

  const status = useMemo(
    () => (isRecording ? "recording" : isTranscribing ? "transcribing" : "idle"),
    [isRecording, isTranscribing],
  );

  const enable = useCallback(() => {
    setEnabled(true);
    void startRecording();
  }, [startRecording]);

  const disable = useCallback(() => {
    setEnabled(false);
    clearLoopTimeout();
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    lastTranscript,
    error,
    status,
    enabled,
    enable,
    disable,
  };
};
