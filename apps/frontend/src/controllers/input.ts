import { simulationWs } from "../services/websocket";

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
  KeyA: () => {
    state.steering = -1;
  },
  KeyD: () => {
    state.steering = 1;
  },
  KeyW: () => {
    state.throttle = 1;
  },
  KeyS: () => {
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
  KeyA: () => {
    state.steering = 0;
  },
  KeyD: () => {
    state.steering = 0;
  },
  KeyW: () => {
    state.throttle = 0;
  },
  KeyS: () => {
    state.brake = 0;
  },
};

let inputInterval: ReturnType<typeof setInterval> | null = null;

function handleKeyDown(e: KeyboardEvent): void {
  const handler = KEY_BINDINGS[e.code];
  if (handler) {
    e.preventDefault();
    handler();
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  const handler = KEY_RELEASE[e.code];
  if (handler) {
    e.preventDefault();
    handler();
  }
}

function sendInput(): void {
  if (state.steering !== 0 || state.throttle !== 0 || state.brake !== 0) {
    simulationWs.send({
      type: "player_input",
      steering: state.steering,
      throttle: state.throttle,
      brake: state.brake,
    });
  }
}

export function startInputListeners(): void {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  inputInterval = setInterval(sendInput, 50);
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
