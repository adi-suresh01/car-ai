#!/usr/bin/env python3
"""Export a trained SB3 PPO model to ONNX format for browser inference.

Usage:
    python scripts/export_onnx.py --model checkpoints/ppo_highway_final.zip
    python scripts/export_onnx.py --model checkpoints/best/best_model.zip --output custom_path.onnx
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import yaml

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root / "src"))

from car_ai_rl.observation import OBSERVATION_DIM


def load_config(path: str | None) -> dict:
    if path is None:
        path = str(_project_root / "configs" / "default.yaml")
    with open(path) as f:
        return yaml.safe_load(f)


class PolicyWrapper(torch.nn.Module):
    """Wrapper that extracts the deterministic action from the SB3 policy.

    SB3 PPO uses an ActorCriticPolicy with separate actor and critic networks.
    For inference in the browser, we only need the actor (policy) network
    producing deterministic actions (the mean of the Gaussian, no sampling).
    """

    def __init__(self, sb3_policy: torch.nn.Module) -> None:
        super().__init__()
        self.mlp_extractor = sb3_policy.mlp_extractor
        self.action_net = sb3_policy.action_net

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        features = self.mlp_extractor.forward_actor(obs)
        return self.action_net(features)


def export_to_onnx(
    model_path: str,
    output_path: str,
    opset_version: int = 17,
) -> None:
    from stable_baselines3 import PPO

    print(f"Loading model from {model_path}...")
    model = PPO.load(model_path, device="cpu")

    policy = model.policy
    policy.eval()

    wrapper = PolicyWrapper(policy)
    wrapper.eval()

    dummy_input = torch.randn(1, OBSERVATION_DIM, dtype=torch.float32)

    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Exporting to ONNX (opset {opset_version})...")
    torch.onnx.export(
        wrapper,
        dummy_input,
        output_path,
        opset_version=opset_version,
        input_names=["observation"],
        output_names=["action"],
        dynamic_axes={
            "observation": {0: "batch_size"},
            "action": {0: "batch_size"},
        },
    )

    print("Validating ONNX model...")
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)

    print("Verifying ONNX output matches PyTorch...")
    session = ort.InferenceSession(output_path)

    test_inputs = np.random.randn(5, OBSERVATION_DIM).astype(np.float32)

    with torch.no_grad():
        torch_output = wrapper(torch.from_numpy(test_inputs)).numpy()

    onnx_output = session.run(
        ["action"],
        {"observation": test_inputs},
    )[0]

    max_diff = np.max(np.abs(torch_output - onnx_output))
    print(f"Max absolute difference between PyTorch and ONNX: {max_diff:.2e}")

    if max_diff > 1e-5:
        print(f"WARNING: Difference exceeds tolerance (1e-5). Max diff: {max_diff}")
    else:
        print("Verification passed: ONNX output matches PyTorch output.")

    file_size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"Exported ONNX model: {output_path} ({file_size_mb:.2f} MB)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export PPO model to ONNX")
    parser.add_argument(
        "--model",
        type=str,
        required=True,
        help="Path to trained SB3 PPO model (.zip)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output ONNX path (default: from config)",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to YAML config file",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=None,
        help="ONNX opset version (default: from config)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.config)
    export_cfg = cfg["export"]

    output_path = args.output or export_cfg["onnx_path"]
    opset_version = args.opset or export_cfg["opset_version"]

    if not Path(output_path).is_absolute():
        output_path = str(_project_root / output_path)

    export_to_onnx(
        model_path=args.model,
        output_path=output_path,
        opset_version=opset_version,
    )


if __name__ == "__main__":
    main()
