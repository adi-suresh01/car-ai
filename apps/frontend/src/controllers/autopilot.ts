import type { RLObservation, RLAction } from "../models/types";

const ONNX_MODEL_PATH = "/rl/ppo-highway.onnx";

class AutopilotController {
  private session: unknown = null;
  private ready = false;

  async initialize(): Promise<boolean> {
    try {
      const ort = await import("onnxruntime-web");
      this.session = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
        executionProviders: ["wasm"],
      });
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  async infer(observation: RLObservation): Promise<RLAction> {
    if (!this.ready || !this.session) {
      return { throttle: 0, brake: 0, laneRequest: 0 };
    }

    try {
      const ort = await import("onnxruntime-web");
      const inputData = new Float32Array([
        observation.lanePosition,
        observation.lateralOffset,
        observation.speed,
        observation.targetSpeed,
        observation.gapAhead,
        observation.gapBehind,
        observation.relSpeedAhead,
        observation.relSpeedBehind,
        observation.missionMode,
        observation.targetLane,
        observation.laneChangeDir,
        observation.crossLaneGap,
      ]);

      const tensor = new ort.Tensor("float32", inputData, [1, 12]);
      const session = this.session as {
        run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
      };
      const results = await session.run({ obs: tensor });

      const actionKey = Object.keys(results)[0];
      if (!actionKey) {
        return { throttle: 0, brake: 0, laneRequest: 0 };
      }

      const output = results[actionKey].data;
      return {
        throttle: Math.max(0, Math.min(1, output[0])),
        brake: Math.max(0, Math.min(1, output[1])),
        laneRequest: Math.max(-1, Math.min(1, output[2])),
      };
    } catch {
      return { throttle: 0, brake: 0, laneRequest: 0 };
    }
  }

  get isReady(): boolean {
    return this.ready;
  }
}

export const autopilot = new AutopilotController();
