# VoiceDrive Roadmap

## Phase 1 – Visual shell (completed)
- Split-screen driver POV and tactical overview built with Three.js.
- MVC-aligned frontend folders (models/controllers/views/services/state).
- Backend service serving CA-101 / CA-1 scene metadata for layout bootstrapping.

## Phase 2 – Voice control loop
- **Speech**: Connect ElevenLabs Agents for streaming STT/TTS; design function schema (`gotoLane`, `setSpeed`, `scheduleExit`).
- **Intent parsing**: Host Fireworks.ai function-calling model (e.g., Llama 3 70B) to convert transcribed utterances into structured commands.
- **Controller bridge**: Implement command queue and lane-change planner on the frontend; confirm deterministic fallback if voice parsing fails.

## Phase 3 – Game feel & dynamics
- Extend backend scenes with lane geometry, curvature, and speed profiles sampled from CA-101, CA-1, and I-280 telemetry.
- Add non-player vehicles with behavior trees (stochastic cruising, overtakes, slow trucks).
- Integrate basic physics (bicycle model, collision envelopes) to drive responsive animations.

## Phase 4 – Reinforcement learning pilot
- Build a headless environment mirroring the frontend dynamics for training (Node + TensorFlow.js or Python Gym).
- Train PPO/DQN baseline to track LLM goals (lane targets, exit deadlines, speed compliance).
- Export policies via ONNX → run with `onnxruntime-web` in the browser.
- Compare RL vs rule-based using Fireworks.ai eval traces.

## Phase 5 – Telemetry & evals
- Stream simulation traces and command outcomes to Convex.dev (session store + event log).
- Implement scenario-based eval harness (paraphrased commands, varying traffic). Record metrics: goal adherence, time-to-comply, jerk, infractions.
- Generate dashboards + leaderboards for hackathon demo narrative.

## Phase 6 – Narrative polish
- Add tutorial scripting, achievements, and guided lessons for freeway etiquette.
- Layer Eragon.ai (optional) as orchestration layer to sequence multi-step missions (merge → maintain speed → exit).
- Ship cinematic camera transitions, lighting changes, and sponsor callouts for demo flow.
