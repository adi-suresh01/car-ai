import { useSimulationStore } from "../state/simulationStore";
import type {
  SimulationStateMessage,
  ClientMessage,
} from "../models/types";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:4000/ws/simulation";

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 16000;

class SimulationWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  connect(): void {
    if (this.disposed) return;
    this.cleanup();

    try {
      this.ws = new WebSocket(WS_URL);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        useSimulationStore.getState().setConnected(true);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onclose = () => {
        useSimulationStore.getState().setConnected(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        useSimulationStore.getState().setConnected(false);
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as SimulationStateMessage;

      if (msg.type === "state") {
        const store = useSimulationStore.getState();
        store.updateFromServer(
          msg.timestamp,
          msg.player,
          msg.vehicles,
          msg.mission,
          msg.collision
        );
      }
    } catch {
      // Silently drop malformed messages
    }
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  disconnect(): void {
    this.disposed = true;
    this.cleanup();
    useSimulationStore.getState().setConnected(false);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const simulationWs = new SimulationWebSocket();
