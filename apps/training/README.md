# car-ai RL Training

This package hosts the Python reinforcement-learning stack for the simulator. It provides:

- A Gymnasium-compatible highway environment that mirrors the TypeScript simulation.
- Scripts to train PPO/DQN controllers with Stable-Baselines3.
- Utilities to export the resulting policy to ONNX for browser inference.
- Fireworks RFT job specs for hosted training/evaluation.
