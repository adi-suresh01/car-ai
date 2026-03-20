import { simulationWs } from "../services/websocket";
import { useSimulationStore } from "../state/simulationStore";

interface InputState {
  steering: number;
  throttle: number;
  brake: number;
}

const state: InputState = {
  steering: 0,
  throttle: 0,
  brake: 0,
};

const KEY_BINDINGS: Record<string, () => void> = {
  ArrowLeft: () => {
    state.steering = -1;
  },
  ArrowRight: () => {
    state.steering = 1;
  },
  ArrowUp: () => {
    state.throttle = 1;
  },
  ArrowDown: () => {
    state.brake = 1;
  },
  Space: () => {
    state.brake = 1;
  },
};

const KEY_RELEASE: Record<string, () => void> = {
  ArrowLeft: () => {
    state.steering = 0;
  },
  ArrowRight: () => {
    state.steering = 0;
  },
  ArrowUp: () => {
    state.throttle = 0;
  },
  ArrowDown: () => {
    state.brake = 0;
  },
  Space: () => {
    state.brake = 0;
  },
};

let inputInterval: ReturnType<typeof setInterval> | null = null;
let wasActive = false;

function isTyping(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isOverlayOpen(): boolean {
  const store = useSimulationStore.getState();
  return store.showHelpOverlay || store.showScenarioSelector;
}

function handleKeyDown(e: KeyboardEvent): void {
  if (isTyping(e) || isOverlayOpen()) return;

  const handler = KEY_BINDINGS[e.code];
  if (handler) {
    e.preventDefault();
    handler();
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  if (isTyping(e) || isOverlayOpen()) return;

  const handler = KEY_RELEASE[e.code];
  if (handler) {
    e.preventDefault();
    handler();
  }
}

function sendInput(): void {
  if (useSimulationStore.getState().autopilotEnabled) return;

  const isActive = state.steering !== 0 || state.throttle !== 0 || state.brake !== 0;

  // Cancel cruise/auto modes when manual input is detected
  if (isActive && !wasActive) {
    const store = useSimulationStore.getState();
    if (store.mission.mode !== "hold" && (state.throttle > 0 || state.brake > 0)) {
      useSimulationStore.setState({
        mission: { ...store.mission, mode: "hold", source: "manual", updatedAt: Date.now() },
      });
    }
  }

  if (isActive || wasActive) {
    simulationWs.send({
      type: "player_input",
      steering: state.steering,
      throttle: state.throttle,
      brake: state.brake,
    });
  }

  wasActive = isActive;
}

export function getInputState(): Readonly<InputState> {
  return state;
}

export function startInputListeners(): void {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  inputInterval = setInterval(sendInput, 16);
}

export function stopInputListeners(): void {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  if (inputInterval) {
    clearInterval(inputInterval);
    inputInterval = null;
  }
  state.steering = 0;
  state.throttle = 0;
  state.brake = 0;
}
