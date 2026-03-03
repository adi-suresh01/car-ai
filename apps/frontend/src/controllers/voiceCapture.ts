import { useSimulationStore } from "../state/simulationStore";
import { simulationWs } from "../services/websocket";

const VAD_THRESHOLD = 0.015;
const SILENCE_TIMEOUT_MS = 1200;

const DRIVING_KEYWORDS = [
  "cruise",
  "speed",
  "lane",
  "left",
  "right",
  "overtake",
  "pass",
  "exit",
  "stop",
  "go",
  "faster",
  "slower",
  "hold",
  "brake",
  "accelerate",
  "change",
  "merge",
  "follow",
  "gap",
];

function containsDrivingKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return DRIVING_KEYWORDS.some((kw) => lower.includes(kw));
}

export class VoiceCaptureController {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private active = false;
  private recording = false;
  private silenceStart = 0;
  private chunks: Float32Array[] = [];
  private monitorFrame = 0;

  async start(): Promise<void> {
    if (this.active) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.3;

      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (e) => {
        if (this.recording) {
          const input = e.inputBuffer.getChannelData(0);
          this.chunks.push(new Float32Array(input));
        }
      };

      source.connect(this.analyser);
      this.analyser.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.active = true;
      this.monitor();
    } catch {
      this.stop();
    }
  }

  stop(): void {
    this.active = false;
    cancelAnimationFrame(this.monitorFrame);

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    this.analyser = null;
    this.recording = false;
    this.chunks = [];
  }

  private monitor = (): void => {
    if (!this.active || !this.analyser) return;

    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);

    useSimulationStore.getState().setVoiceLevel(Math.min(1, rms * 10));

    const now = Date.now();
    if (rms > VAD_THRESHOLD) {
      this.silenceStart = now;
      if (!this.recording) {
        this.recording = true;
        this.chunks = [];
        useSimulationStore.getState().setVoiceActive(true);
      }
    } else if (this.recording && now - this.silenceStart > SILENCE_TIMEOUT_MS) {
      this.recording = false;
      useSimulationStore.getState().setVoiceActive(false);
      this.processChunks();
    }

    this.monitorFrame = requestAnimationFrame(this.monitor);
  };

  private processChunks(): void {
    if (this.chunks.length === 0) return;

    const totalLength = this.chunks.reduce((a, c) => a + c.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];

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
        if (!data.text?.trim()) return;

        const utterance = data.text.trim();

        if (!containsDrivingKeyword(utterance)) return;

        simulationWs.send({ type: "voice_command", utterance });

        useSimulationStore.getState().addVoiceCommand({
          id: `vc-${Date.now()}`,
          utterance,
          interpretedAs: utterance,
          timestamp: Date.now(),
          success: true,
        });
      })
      .catch(() => {});
  }
}
