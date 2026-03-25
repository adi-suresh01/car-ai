import { simulationWs } from "../services/websocket";
import { useSimulationStore } from "../state/simulationStore";

interface InputState {
  steering: number;
  throttle: number;
  brake: number;
}

// Raw key state (binary 0/1)
const keys = {
  steerLeft: false,
  steerRight: false,
  throttle: false,
  brake: false,
};

// Smoothed output values sent to backend
const state: InputState = {
  steering: 0,
  throttle: 0,
  brake: 0,
};

// Steering ramps up/down smoothly instead of snapping to ±1
const STEER_RAMP_SPEED = 2.5;   // per second — reaches full lock in ~0.4s
const STEER_RETURN_SPEED = 4.0; // per second — centers faster than it turns
const STEER_MAX = 0.6;          // cap at 60% of max lock for keyboard (full lock is too aggressive)

const KEY_BINDINGS: Record<string, () => void> = {
  ArrowLeft: () => { keys.steerLeft = true; },
  ArrowRight: () => { keys.steerRight = true; },
  ArrowUp: () => { keys.throttle = true; },
  ArrowDown: () => { keys.brake = true; },
  Space: () => { keys.brake = true; },
};

const KEY_RELEASE: Record<string, () => void> = {
  ArrowLeft: () => { keys.steerLeft = false; },
  ArrowRight: () => { keys.steerRight = false; },
  ArrowUp: () => { keys.throttle = false; },
  ArrowDown: () => { keys.brake = false; },
  Space: () => { keys.brake = false; },
};

let inputInterval: ReturnType<typeof setInterval> | null = null;
let wasActive = false;
let lastUpdateTime = 0;

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

function updateSmoothedInput(): void {
  const now = performance.now();
  const dt = lastUpdateTime === 0 ? 0.016 : Math.min((now - lastUpdateTime) / 1000, 0.1);
  lastUpdateTime = now;

  // Smooth steering ramp
  const steerTarget = (keys.steerLeft ? -STEER_MAX : 0) + (keys.steerRight ? STEER_MAX : 0);
  if (Math.abs(steerTarget) > 0.01) {
    // Ramping toward target
    const diff = steerTarget - state.steering;
    const step = STEER_RAMP_SPEED * dt;
    if (Math.abs(diff) < step) {
      state.steering = steerTarget;
    } else {
      state.steering += Math.sign(diff) * step;
    }
  } else {
    // Returning to center
    const step = STEER_RETURN_SPEED * dt;
    if (Math.abs(state.steering) < step) {
      state.steering = 0;
    } else {
      state.steering -= Math.sign(state.steering) * step;
    }
  }

  // Throttle and brake stay binary (responsive)
  state.throttle = keys.throttle ? 1 : 0;
  state.brake = keys.brake ? 1 : 0;
}

function sendInput(): void {
  if (useSimulationStore.getState().autopilotEnabled) return;

  updateSmoothedInput();

  const isActive = Math.abs(state.steering) > 0.01 || state.throttle > 0 || state.brake > 0;

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
  lastUpdateTime = 0;
  inputInterval = setInterval(sendInput, 16);
}

export function stopInputListeners(): void {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  if (inputInterval) {
    clearInterval(inputInterval);
    inputInterval = null;
  }
  keys.steerLeft = false;
  keys.steerRight = false;
  keys.throttle = false;
  keys.brake = false;
  state.steering = 0;
  state.throttle = 0;
  state.brake = 0;
}
