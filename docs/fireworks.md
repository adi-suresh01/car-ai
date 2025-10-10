# Fireworks Integration Blueprint

## 1. Why Fireworks for the Driving Simulator
- **Fast hosted models**: low-latency intent parsing for voice commands and policy distillation experiments.
- **Reinforcement Fine-Tuning (RFT)**: run policy-gradient style training directly on Fireworks infra instead of standing up bespoke GPU clusters.
- **Evaluators & traces**: reproducible scenario benchmarking, quality scoring, and regression diffs across controller versions.

We will use Fireworks in two complementary loops:
1. **Online control loop** – an intent model (Fireworks-hosted) converts ElevenLabs speech transcripts into structured driving goals.
2. **Autonomy training loop** – Fireworks RFT trains and evaluates the low-level controller that executes those goals inside our simulator.

## 2. Autonomy Objectives
- Maintain lane discipline at highway speeds with smooth steering.
- Perform voice-driven maneuvers (“merge right”, “take exit 442”) while respecting traffic gaps.
- Deliver adaptive cruise control: hold target speed when free, match the lead vehicle while maintaining an N-car buffer (configurable at runtime).
- Minimise hard braking, lateral jerk, and collisions across California highway scenarios (US-101, CA-1, etc.).

## 3. Environment & Policy Layout

### 3.1 Simulation hooks (already in repo)
- `apps/backend/src/rl/drivingEnv.ts` exposes a Gym-like environment.
- Observations (extend as needed):
  - Ego lane index & within-lane offset.
  - Ego speed, acceleration, gear.
  - Lead/lag vehicle distances & relative velocity per lane.
  - Target voice goal: lane_id, target_speed_mph, min_gap_cars.
  - Road context: curvature flag, lane availability, speed limit.
- Actions (continuous vector):
  - Longitudinal throttle ∈ [-1, 1] (negative = brake).
  - Lateral command ∈ [-1, 1] (maps to steering torque or target lane offset).
  - Optional discrete headlight/indicator toggles (for realism).

### 3.2 Controller stack
| Layer | Responsibility | Implementation path |
| --- | --- | --- |
| High-level planner | Translate Fireworks intent JSON into objective tuple `{ lane_goal, speed_target, gap_target }`. | Fireworks hosting of open LLM (e.g., Llama 3) with function calling. |
| Primary RL policy | Produce continuous throttle & steering corrections while enforcing gap / speed. | Train via Fireworks RFT (PPO-style). |
| Safety supervisor | Deterministic checks (collision envelope, actuator limits). | Keep in `simulationService` as last line of defence. |

## 4. Training Pipeline with Fireworks RFT

### 4.1 Account & CLI
1. Create Fireworks account (free tier is enough for eval experimentation).
2. Install CLI: `pip install fireworks-cli`.
3. Authenticate: `fireworks login --api-key $FIREWORKS_API_KEY`.

### 4.2 Episode generation
1. Run the built-in generator to produce JSONL rollouts:
   ```bash
   cd apps/backend
   npm run generate:episodes -- --episodes 500 --speed 72 --gap-cars 3 --lane 1
   ```
2. Each episode should serialize:
   - `initial_state`
   - `step_sequence` with `{ observation, action, reward, done }`.
   - Metadata: `{ command, seed, weather, traffic_profile }`.
3. Store them under `data/fireworks/episodes/*.jsonl`.

### 4.3 Fireworks RFT job spec
Create `fireworks-rft.yaml`:
```yaml
version: "1"
name: "highway-cruise-ppo"
environment:
  docker_image: "fireworksai/rft-gym:latest"
  entrypoint: ["python", "train.py"]
resources:
  cluster: "shared-gpu-a10"
  max_duration: "04:00:00"
inputs:
  episodes_uri: "s3://your-bucket/highway/episodes/"
  config_uri: "s3://your-bucket/highway/config.yml"
outputs:
  checkpoints_uri: "s3://your-bucket/highway/checkpoints/"
tags:
  - "car-ai"
  - "autopilot"
```
Key files uploaded to S3 (or Fireworks object storage):
- `train.py`: loads `DrivingEnvironment`, wraps PPO (Stable-Baselines3 or custom), streams metrics to stdout for Fireworks trace capture.
- `config.yml`: reward weights, curriculum settings (see §4.4).

Submit job:
```bash
fireworks rft jobs create --spec fireworks-rft.yaml
fireworks rft jobs logs <job_id>   # follow training
```

### 4.4 Reward shaping blueprint
Let `r = w_progress * Δs + w_lane * lane_penalty + w_gap * gap_reward + w_comfort * comfort_penalty + w_collision * collision_penalty`.
- `Δs`: forward distance advance.
- `lane_penalty`: abs(lateral_offset) plus bonus when lane_goal satisfied.
- `gap_reward`: + when following distance ≥ gap_target, − when < gap_target.
- `comfort_penalty`: quadratic jerk + steering rate > threshold.
- `collision_penalty`: large negative (terminate episode).
- Add curriculum: start with sparse traffic & static goals, then mix in high-density seeds and dynamic goal updates mid-episode.

## 5. Adaptive Cruise Control Training

1. **State augmentation**: include `gap_target_meters` and `speed_target_mps` from voice command.
2. **Scenario generator**:
   - Randomize lead vehicle behaviour (slowdown, emergency brake, cut-in).
   - Vary highway lane limits; ensure express lane faster distribution.
3. **Reward tweaks**:
   - `gap_reward = clamp(goal_gap - actual_gap, -1, 1)` flipped so 0 gap error gives positive score.
   - Additional penalty when overshooting target speed (>2 mph above) or undershooting when lane is free.
4. **Evaluation probes** (automated via Fireworks evaluators):
   - Lead car deceleration test (ensure stopping distance).
   - Stop-and-go traffic test.
   - Lane change while on cruise – maintain speed within ±3 mph after merge.

## 6. Fireworks Evaluators Workflow

### 6.1 Test configuration
Create `evals/highway_cruise.yaml`:
```yaml
name: "highway_cruise_regression"
description: "Cruise control gap-keeping and lane-change safety"
runs:
  - name: "ppo-v1"
    controller_checkpoint: "s3://your-bucket/highway/checkpoints/ppo-v1.pt"
    scenarios_uri: "s3://your-bucket/highway/evals/scenarios_v1.jsonl"
metrics:
  - name: "collision_rate"
  - name: "avg_gap_error"
  - name: "goal_completion_time"
  - name: "comfort_score"
scoring:
  success_condition: "collision_rate == 0 and avg_gap_error < 0.5"
```

### 6.2 Run evaluator
```bash
fireworks evals run --config evals/highway_cruise.yaml
```
Outputs: JSON + trace dashboard with per-scenario timelines. Store summaries in Convex (optional) for leaderboards.

## 7. Step-by-Step Adoption Plan
1. **Accounts & Keys**: Fireworks (this file), ElevenLabs (already planned), Convex (if using for telemetry).
2. **Local validation**: Extend `DrivingEnvironment` reward and command injection for cruise control targets.
3. **Episode exporter**: Use `npm run generate:episodes` to produce offline rollouts with the heuristic controller; inspect the JSONL under `data/fireworks/` before uploading.
4. **First RFT run**: Train PPO with modest horizons (e.g., 20 s episodes). Inspect logs for reward trends & gap adherence.
5. **Evaluator harness**: Build scenario set mirroring real voice commands (merge left/right, emergency brake, cruise control). Register with Fireworks evaluators.
6. **Iterate**: Compare heuristics vs PPO vs future SAC variant; adjust reward weights, observation scaling, curriculum difficulty.
7. **Integrate back into frontend**: Load best checkpoint through ONNX Runtime Web (export after training). Tie to voice commands: Fireworks-hosted LLM parses, passes `{speed_target, gap_target, lane_goal}` to controller.

## 8. Optional Convex Hooks
- Use Convex functions to log each Fireworks eval run, storing key metrics and diff snapshots for the live leaderboard.
- Provide replay links pointing to Fireworks trace URLs.
- Schedule nightly evaluator runs via Convex tasks, alerting on regressions (e.g., collision_rate > 0).

## 9. What to Prepare Next
- Confirm you have Fireworks CLI access (request API key if not).
- Decide on storage (S3, GCS, or Fireworks-managed) for episodes/checkpoints.
- Implement the episode exporter script and validate JSONL schema.
- Finalize reward weights and curriculum stages before launching the first RFT job.

With this blueprint, you can move from heuristic control to a quantifiably safer RL policy, using Fireworks both for training (RFT) and for rigorous scenario-based evaluation. Tie the resulting policy back into the voice-driven gameplay loop to deliver Tesla-grade adaptive cruise and lane management.***
