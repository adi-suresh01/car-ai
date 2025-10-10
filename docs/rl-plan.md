# Reinforcement Learning Plan

## Environment contract
- **State vector** (per simulation tick, 10 Hz):
  - ego lane index, lateral offset (m), heading delta (rad).
  - ego speed (mph), acceleration (m/s²).
  - upcoming exit distance (m), desired lane from intent planner.
  - For each neighboring lane (left, same, right): lead vehicle gap (m), relative speed (mph), tail vehicle gap (m).
  - Traffic light / signage flags (future extension).
- **Action space**:
  - `steer_delta` ∈ {−1, 0, +1} for discrete lane-change decisions (bicycle model converts to steering angle).
  - `throttle_cmd` ∈ {−1, 0, +1} to adjust target speed in ±5 mph increments with rate limiting.
  - `signal_cmd` ∈ {none, left, right} to enforce signaling policy.
- **Reward design**:
  - +1.0 for reaching commanded lane or exit within tolerance window.
  - +0.1 per second for maintaining target speed band; −0.2 for speeding >5 mph.
  - −2.0 for collisions or solid-line crossings; episode terminates.
  - −0.5 for harsh lateral jerk (>2 m/s³) or tailgating (<1.5 s gap).
  - Shaping bonus for smooth merges (signal on ≥1.5 s before lane change, gap > 1 car length).

### Backend implementation notes
- `SimulationService` now maintains live NPC traffic using lane-aware spawn tables. Query it via `GET /api/simulation/state` for real-time lane densities.
- `POST /api/simulation/traffic/spawn` and `/traffic/reset` let evaluators script deterministic scenarios.
- `DrivingEnvironment` (TypeScript) mirrors the same lane profiles for headless training; consume it from `apps/backend/src/rl/drivingEnv.ts`.
- The environment emits `DrivingStepResult` objects with reward breakdown + snapshots, which map 1:1 to Fireworks evaluator payloads.

## Training pipeline
1. Mirror the browser simulator in a headless Node/TypeScript env (shared physics module).
2. Generate scenario seeds: lane closures, slow trucks, aggressive vehicles for curriculum learning.
3. Run PPO (Stable-Baselines3) against the environment via Python binding (`gymnasium` API) exporting checkpoints every N updates.
4. Distill the trained policy to ONNX (use `onnxruntime` export from PyTorch) and load into the web app with `onnxruntime-web`.
5. Compare policy vs rule-based baseline on eval harness (Fireworks evals + Convex logs).

## Integration points
- **Backend**: expose `/api/simulation/scenario` to fetch seed + traffic config; log RL rollouts for analysis.
- **Frontend**: plug policy inference into controller after intent planner chooses a goal; fallback to heuristic if policy confidence low.
- **Telemetry**: emit per-step rewards, infractions, compliance metrics to Convex for dashboards and sponsor judging.

## Data storage
- Store scenario definitions under `data/scenarios/*.json` (lane geometry, spawn tables).
- Persist training/eval metrics in Convex collections (`episodes`, `infractions`, `controller_stats`).
