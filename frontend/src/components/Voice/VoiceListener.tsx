import { useEffect, useRef, useCallback } from "react";
import { useSimulationStore } from "../../state/simulationStore";
import { simulationWs } from "../../services/websocket";
import { parseAndApplyVoiceCommand } from "../../controllers/voiceParser";

const VAD_THRESHOLD = 0.015;
const VAD_SILENCE_MS = 1200;
const SAMPLE_RATE = 16000;

export function VoiceListener() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const chunksRef = useRef<Float32Array[]>([]);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);

  const processVoiceBuffer = useCallback((buffer: Float32Array[]) => {
    if (buffer.length === 0) return;

    const totalLength = buffer.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of buffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const pcm16 = new Int16Array(combined.length);
    for (let i = 0; i < combined.length; i++) {
      const s = Math.max(-1, Math.min(1, combined[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const blob = new Blob([pcm16.buffer], { type: "audio/pcm" });

    fetch("/api/voice/transcribe", {
      method: "POST",
      body: blob,
      headers: { "Content-Type": "audio/pcm" },
    })
      .then((res) => res.json())
      .then((data: { text?: string }) => {
        if (data.text && data.text.trim().length > 0) {
          const utterance = data.text.trim();
          simulationWs.send({ type: "voice_command", utterance });

          useSimulationStore.getState().addVoiceCommand({
            id: `vc-${Date.now()}`,
            utterance,
            interpretedAs: utterance,
            timestamp: Date.now(),
            success: true,
          });
        }
      })
      .catch(() => {
        // Voice transcription unavailable
      });
  }, []);

  const monitorLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);

    useSimulationStore.getState().setVoiceLevel(Math.min(1, rms * 10));

    const now = Date.now();
    if (rms > VAD_THRESHOLD) {
      silenceStartRef.current = now;
      if (!isRecordingRef.current) {
        isRecordingRef.current = true;
        chunksRef.current = [];
        useSimulationStore.getState().setVoiceActive(true);
      }
    } else if (isRecordingRef.current) {
      if (now - silenceStartRef.current > VAD_SILENCE_MS) {
        isRecordingRef.current = false;
        useSimulationStore.getState().setVoiceActive(false);
        processVoiceBuffer(chunksRef.current);
        chunksRef.current = [];
      }
    }

    animFrameRef.current = requestAnimationFrame(monitorLevel);
  }, [processVoiceBuffer]);

  useEffect(() => {
    let mounted = true;

    async function initMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: SAMPLE_RATE,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.3;
        analyserRef.current = analyser;

        const scriptNode = ctx.createScriptProcessor(4096, 1, 1);
        scriptNodeRef.current = scriptNode;

        scriptNode.onaudioprocess = (e) => {
          if (isRecordingRef.current) {
            const input = e.inputBuffer.getChannelData(0);
            chunksRef.current.push(new Float32Array(input));
          }
        };

        source.connect(analyser);
        analyser.connect(scriptNode);
        scriptNode.connect(ctx.destination);

        animFrameRef.current = requestAnimationFrame(monitorLevel);
      } catch {
        // Microphone not available or permission denied
      }
    }

    initMic();

    return () => {
      mounted = false;
      cancelAnimationFrame(animFrameRef.current);

      if (scriptNodeRef.current) {
        scriptNodeRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [monitorLevel]);

  return null;
}
