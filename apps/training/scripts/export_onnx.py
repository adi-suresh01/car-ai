"""Export a trained Stable-Baselines3 policy to ONNX for browser inference."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
import torch
from stable_baselines3 import PPO

from car_ai_rl import HighwayMissionEnv, HighwayEnvConfig


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export PPO policy to ONNX")
    parser.add_argument("model", type=Path, help="Path to the SB3 .zip model")
    parser.add_argument("output", type=Path, help="Destination ONNX file path")
    parser.add_argument("--seed", type=int, default=42, help="Env seed for dummy observation")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    env = HighwayMissionEnv(HighwayEnvConfig(seed=args.seed))
    obs, _ = env.reset()
    obs_tensor = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)

    model = PPO.load(args.model, device="cpu")
    policy = model.policy

    def wrapped(obs_tensor: torch.Tensor) -> torch.Tensor:
        return policy.predict(obs_tensor, deterministic=True)[0]

    traced = torch.jit.trace(policy, obs_tensor)
    onnx_path = args.output
    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        traced,
        obs_tensor,
        onnx_path,
        input_names=["obs"],
        output_names=["action"],
        opset_version=17,
    )

    onnx_model = onnx.load(onnx_path)
    onnx.checker.check_model(onnx_model)
    print(f"Exported ONNX policy to {onnx_path}")


if __name__ == "__main__":
    main()
