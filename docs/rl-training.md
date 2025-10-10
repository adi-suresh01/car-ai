# RL Training Workflow

This guide explains how to train, evaluate, and export the highway controller using the new
Python stack under `apps/training`.

## 1. Environment & dependencies

```bash
cd apps/training
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

The `car_ai_rl` package mirrors the TypeScript simulator: observations include lane position,
speed, mission targets, and gap measurements; actions control throttle, brake, and lane requests.

## 2. Local PPO training

```bash
cd apps/training
python scripts/train_ppo.py --steps 1500000 --n-envs 4 --log-dir runs/ppo-local
```

Outputs:
- TensorBoard logs under `runs/ppo-local/tb`
- Checkpoints in `runs/ppo-local/checkpoints`
- Final model `runs/ppo-local/ppo-highway-final.zip`

View learning curves:
```bash
tensorboard --logdir runs/ppo-local/tb
```

## 3. Export to ONNX

```bash
python scripts/export_onnx.py \
  runs/ppo-local/ppo-highway-final.zip \
  runs/ppo-local/ppo-highway-final.onnx
```

Use the ONNX file in the browser via `onnxruntime-web` (load weights inside the controller module
hooked to the mission store).

## 4. Fireworks RFT job

1. Push your repo or training directory to the workspace used by Fireworks.
2. Authenticate if you haven’t already: `fireworks login`
3. Submit the job:
   ```bash
   cd apps/training
   fireworks rft jobs create --spec fireworks/rft-ppo.yaml
   ```
4. Tail logs: `fireworks rft jobs logs <job_id>`
5. Download checkpoints from the job artifacts when it finishes.

### Customising the spec
- Adjust `entrypoint` arguments (steps, n-envs) in `fireworks/rft-ppo.yaml`
- Change `cluster` or `max_duration` based on quota
- Add environment variables (e.g. curriculum flags)

## 5. Evaluations

1. Generate rollout episodes (heuristic or trained policy) using the backend tool: `npm run generate:episodes`
2. Build Fireworks evaluator config comparing policy checkpoints (see `docs/fireworks.md`, §6)
3. Run: `fireworks evals run --config evals/highway_cruise.yaml`

## 6. Wiring back into the app

1. Serve the ONNX policy with `onnxruntime-web` in the frontend (load weights on mission updates)
2. Keep the rule-based safety supervisor active in the backend (collision checks, lane limits)
3. Use mission logs from Convex/Fireworks eval results to monitor regression when training new
   versions (nightly or per feature branch).

With the Python training stack in place, you can iterate quickly: collect mission traces, train
PPO/DQN locally or on Fireworks, export to ONNX, and drop the controller into the voice-driven
simulator.
