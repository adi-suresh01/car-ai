# car-ai RL Training

This package hosts the Python reinforcement-learning stack for the simulator. It provides:

- A Gymnasium-compatible highway environment that mirrors the TypeScript simulation.
- Scripts to train PPO/DQN controllers with Stable-Baselines3.
- Utilities to export the resulting policy to ONNX for browser inference.
- Fireworks RFT job specs for hosted training/evaluation.

## Scenario-driven runs

Scenario seeds live in `data/scenarios/*.json` and can be served by the backend at
`GET /api/simulation/scenario?id=<scenario-id>`. Use them to keep training and eval runs
repeatable across environments. For example, start the backend and fetch the scenario
before training to align mission targets and traffic seeds.
