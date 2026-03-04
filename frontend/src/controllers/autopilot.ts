import { useSimulationStore } from "../state/simulationStore";
import { simulationWs } from "../services/websocket";
import { updateMission } from "../services/api";
import type { RLObservation, RLAction, MissionMode } from "../models/types";
import { PHYSICS } from "../models/types";

const ONNX_MODEL_PATH = "/rl/ppo-highway.onnx";
const INFERENCE_INTERVAL_MS = 100;
const LANE_REQUEST_THRESHOLD = 0.4;

const NUM_LANES = 5;
const MPH_TO_MPS = 0.44704;
const MAX_GAP = 200;
const REL_SPEED_DIVISOR = 20;
const MODE_DIVISOR = 3;

type OrtSession = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
};

type OrtModule = {
  InferenceSession: {
    create(path: string, options: { executionProviders: string[] }): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
};

const MISSION_MODE_INDEX: Record<MissionMode, number> = {
  hold: 0,
  cruise: 1,
  lane_change: 2,
  overtake: 3,
};

function buildObservation(): RLObservation {
  const state = useSimulationStore.getState();
  const { player, vehicles, mission } = state;

  const playerZ = player.positionZ;
  const playerLane = player.laneIndex;

  let gapAhead = MAX_GAP;
  let gapBehind = MAX_GAP;
  let relSpeedAhead = 0;
  let relSpeedBehind = 0;
  let crossLaneGap = MAX_GAP;

  for (const v of vehicles) {
    const dz = v.position[2] - playerZ;
    const sameLane = v.laneIndex === playerLane;
    const leftAdjacentLane = playerLane > 0 && v.laneIndex === playerLane - 1;

    if (sameLane) {
      if (dz > 0 && dz < gapAhead) {
        gapAhead = dz;
        relSpeedAhead = v.speedMps - player.speedMps;
      } else if (dz < 0 && Math.abs(dz) < gapBehind) {
        gapBehind = Math.abs(dz);
        relSpeedBehind = v.speedMps - player.speedMps;
      }
    }

    if (leftAdjacentLane && dz > 0 && dz < crossLaneGap) {
      crossLaneGap = dz;
    }
  }

  const laneChangeDir =
    mission.laneChangeDirection === "left"
      ? -1
      : mission.laneChangeDirection === "right"
        ? 1
        : 0;

  const maxSpeedMps = PHYSICS.MAX_SPEED_MPH * MPH_TO_MPS;

  return {
    lanePosition: player.laneIndex / (NUM_LANES - 1),
    lateralOffset: player.lateralOffset / PHYSICS.LANE_WIDTH_METERS,
    speed: player.speedMps / maxSpeedMps,
    targetSpeed: mission.cruiseTargetSpeedMph / PHYSICS.MAX_SPEED_MPH,
    gapAhead: Math.min(gapAhead, MAX_GAP) / MAX_GAP,
    gapBehind: Math.min(gapBehind, MAX_GAP) / MAX_GAP,
    relSpeedAhead: Math.max(-1, Math.min(1, relSpeedAhead / REL_SPEED_DIVISOR)),
    relSpeedBehind: Math.max(-1, Math.min(1, relSpeedBehind / REL_SPEED_DIVISOR)),
    missionMode: MISSION_MODE_INDEX[mission.mode] / MODE_DIVISOR,
    targetLane: mission.targetLaneIndex / (NUM_LANES - 1),
    laneChangeDir,
    crossLaneGap: Math.min(crossLaneGap, MAX_GAP) / MAX_GAP,
  };
}

function observationToFloat32(obs: RLObservation): Float32Array {
  return new Float32Array([
    obs.lanePosition,
    obs.lateralOffset,
    obs.speed,
    obs.targetSpeed,
    obs.gapAhead,
    obs.gapBehind,
    obs.relSpeedAhead,
    obs.relSpeedBehind,
    obs.missionMode,
    obs.targetLane,
    obs.laneChangeDir,
    obs.crossLaneGap,
  ]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class AutopilotController {
  private session: OrtSession | null = null;
  private ort: OrtModule | null = null;
  private ready = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pendingLaneRequest: "left" | "right" | null = null;

  async initialize(): Promise<boolean> {
    try {
      const ort = (await import("onnxruntime-web")) as unknown as OrtModule;
      this.ort = ort;

      const response = await fetch(ONNX_MODEL_PATH, { method: "HEAD" });
      if (!response.ok) {
        this.ready = false;
        useSimulationStore.getState().setAutopilotReady(false);
        return false;
      }

      this.session = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
        executionProviders: ["wasm"],
      });
      this.ready = true;
      useSimulationStore.getState().setAutopilotReady(true);
      return true;
    } catch {
      this.ready = false;
      useSimulationStore.getState().setAutopilotReady(false);
      return false;
    }
  }

  async infer(observation: RLObservation): Promise<RLAction> {
    if (!this.ready || !this.session || !this.ort) {
      return { throttle: 0, brake: 0, laneRequest: 0 };
    }

    try {
      const inputData = observationToFloat32(observation);
      const tensor = new this.ort.Tensor("float32", inputData, [1, 12]);
      const results = await this.session.run({ obs: tensor });

      const actionKey = Object.keys(results)[0];
      if (!actionKey) {
        return { throttle: 0, brake: 0, laneRequest: 0 };
      }

      const output = results[actionKey].data;
      return {
        throttle: clamp(output[0], 0, 1),
        brake: clamp(output[1], 0, 1),
        laneRequest: clamp(output[2], -1, 1),
      };
    } catch {
      return { throttle: 0, brake: 0, laneRequest: 0 };
    }
  }

  private async runInferenceStep(): Promise<void> {
    const store = useSimulationStore.getState();
    if (!store.autopilotEnabled || !this.ready) return;

    const t0 = performance.now();
    const observation = buildObservation();
    const action = await this.infer(observation);
    const latency = performance.now() - t0;

    store.setAutopilotLatencyMs(Math.round(latency * 10) / 10);

    simulationWs.send({
      type: "player_input",
      steering: 0,
      throttle: action.throttle,
      brake: action.brake,
    });

    this.processLaneRequest(action.laneRequest);
  }

  private processLaneRequest(laneRequest: number): void {
    if (laneRequest < -LANE_REQUEST_THRESHOLD && this.pendingLaneRequest !== "left") {
      this.pendingLaneRequest = "left";
      const store = useSimulationStore.getState();
      const targetLane = Math.max(0, store.player.laneIndex - 1);
      if (targetLane !== store.player.laneIndex) {
        updateMission({
          mode: "lane_change",
          targetLaneIndex: targetLane,
          laneChangeDirection: "left",
          source: "autopilot",
        }).catch(() => {
          // Mission update failed; autopilot will retry on next cycle
        });
      }
    } else if (laneRequest > LANE_REQUEST_THRESHOLD && this.pendingLaneRequest !== "right") {
      this.pendingLaneRequest = "right";
      const store = useSimulationStore.getState();
      const layout = store.layout;
      const maxLane = layout ? layout.lanes.length - 1 : 3;
      const targetLane = Math.min(maxLane, store.player.laneIndex + 1);
      if (targetLane !== store.player.laneIndex) {
        updateMission({
          mode: "lane_change",
          targetLaneIndex: targetLane,
          laneChangeDirection: "right",
          source: "autopilot",
        }).catch(() => {
          // Mission update failed; autopilot will retry on next cycle
        });
      }
    } else if (
      Math.abs(laneRequest) <= LANE_REQUEST_THRESHOLD &&
      this.pendingLaneRequest !== null
    ) {
      this.pendingLaneRequest = null;
    }
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.pendingLaneRequest = null;
    this.intervalId = setInterval(() => {
      this.runInferenceStep();
    }, INFERENCE_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.pendingLaneRequest = null;
    useSimulationStore.getState().setAutopilotLatencyMs(0);

    simulationWs.send({
      type: "player_input",
      steering: 0,
      throttle: 0,
      brake: 0,
    });
  }

  get isReady(): boolean {
    return this.ready;
  }

  get isRunning(): boolean {
    return this.intervalId !== null;
  }
}

export const autopilot = new AutopilotController();
