import { useCallback, useMemo, useRef, useState } from "react";
import { apiClient } from "../services/apiClient";
import { useSimulationStore } from "../state/useSimulationStore";
import type { DrivingMissionState } from "../models/simulation";

interface VoiceCaptureOptions {
  commandEndpoint?: string;
  transcriptionEndpoint?: string;
  modelId?: string;
  language?: string;
  segmentMs?: number;
  enableVad?: boolean;
  vadRmsThreshold?: number;
  onStatusChange?: (status: "idle" | "recording" | "transcribing") => void;
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
  const transcriptBufferRef = useRef<{ text: string; lastUpdated: number }>({
    text: "",
    lastUpdated: 0,
  });

  const shouldSendVoiceCommand = useCallback((transcript: string) => {
    const normalized = transcript.trim().toLowerCase();
    if (!normalized || normalized.length < 3) {
      return false;
    }
    if (!/[a-z0-9]/.test(normalized)) {
      return false;
    }
    const bracketed = normalized.startsWith("(") || normalized.startsWith("[");
    if (bracketed && (normalized.endsWith(")") || normalized.endsWith("]"))) {
      return false;
    }
    const commandKeywords = [
      "cruise",
      "speed",
      "mph",
      "faster",
      "slower",
      "left",
      "right",
      "lane",
      "overtake",
      "gap",
      "exit",
      "offramp",
      "merge",
      "traffic",
      "police",
      "cop",
      "hazard",
      "accident",
      "debris",
      "camera",
    ];
    const hasKeyword = commandKeywords.some((keyword) => normalized.includes(keyword));
    if (!hasKeyword) {
      return false;
    }
    if (/(music|applause|laughter|noise|silence)/.test(normalized)) {
      return false;
    }
    const asciiLetters = (normalized.match(/[a-z]/g) ?? []).length;
    const nonAscii = (normalized.match(/[^\x00-\x7F]/g) ?? []).length;
    if (asciiLetters === 0 && nonAscii > 0) {
      return false;
    }
    return true;
  }, []);

  const bufferTranscript = useCallback((transcript: string) => {
    const now = Date.now();
    const previous = transcriptBufferRef.current;
    const base = now - previous.lastUpdated > 6000 ? "" : previous.text;
    const combined = `${base} ${transcript}`.trim();
    const trimmed = combined.length > 220 ? combined.slice(combined.length - 220) : combined;
    transcriptBufferRef.current = { text: trimmed, lastUpdated: now };
    return trimmed;
  }, []);

  const transcriptionEndpoint = options.transcriptionEndpoint ?? "/voice/transcriptions/file";
  const commandEndpoint = options.commandEndpoint ?? "/voice/command";
  const segmentMs = options.segmentMs ?? 2600;
  const enableVad = options.enableVad ?? true;
  const vadRmsThreshold = options.vadRmsThreshold ?? 0.015;

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
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Microphone permission denied";
      setError(message);
      return;
    }
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
        // eslint-disable-next-line no-console
        console.log("Voice capture", { bytes: arrayBuffer.byteLength, mimeType: recorder.mimeType });
        const languageParam = options.language ?? "en";
        if (await isLikelySilent(arrayBuffer)) {
          setIsTranscribing(false);
          chunksRef.current = [];
          recorder.stream.getTracks().forEach((track) => track.stop());
          if (enabled) {
            clearLoopTimeout();
            loopTimeoutRef.current = window.setTimeout(() => {
              void startRecording();
            }, 180);
          }
          return;
        }
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"}${transcriptionEndpoint}?modelId=${options.modelId ?? ""}&language=${languageParam}`,
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
        // eslint-disable-next-line no-console
        console.log("Voice transcript", data.text);
        const transcript = data.text.trim();
        setLastTranscript(transcript);
        const bufferedTranscript = bufferTranscript(transcript);
        if (shouldSendVoiceCommand(bufferedTranscript)) {
          const commandResponse = await apiClient.post<{ mission?: DrivingMissionState }>(commandEndpoint, {
            utterance: bufferedTranscript,
          });
          if (commandResponse?.mission) {
            useSimulationStore.getState().applyMission(commandResponse.mission);
          }
          transcriptBufferRef.current = { text: "", lastUpdated: 0 };
        }
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
    // eslint-disable-next-line no-console
    console.log("Voice recording started");
    clearLoopTimeout();
    loopTimeoutRef.current = window.setTimeout(() => {
      stopRecording();
    }, segmentMs);
  }, [
    commandEndpoint,
    transcriptionEndpoint,
    options.language,
    options.modelId,
    segmentMs,
    enabled,
    stopRecording,
    shouldSendVoiceCommand,
    isLikelySilent,
    bufferTranscript,
  ]);

  const status = useMemo(
    () => (isRecording ? "recording" : isTranscribing ? "transcribing" : "idle"),
    [isRecording, isTranscribing],
  );

  const onStatusChange = options.onStatusChange;
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

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
  const isLikelySilent = useCallback(
    async (arrayBuffer: ArrayBuffer) => {
      if (!enableVad) {
        return false;
      }
      try {
        const context = new AudioContext();
        const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
        const channel = audioBuffer.getChannelData(0);
        let sumSquares = 0;
        for (let i = 0; i < channel.length; i += 1) {
          const value = channel[i] ?? 0;
          sumSquares += value * value;
        }
        const rms = Math.sqrt(sumSquares / Math.max(1, channel.length));
        await context.close();
        return rms < vadRmsThreshold;
      } catch {
        return false;
      }
    },
    [enableVad, vadRmsThreshold],
  );
