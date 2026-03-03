#!/usr/bin/env python3
"""PPO training script using stable-baselines3.

Usage:
    python scripts/train_ppo.py
    python scripts/train_ppo.py --config configs/default.yaml
    python scripts/train_ppo.py --total-timesteps 2000000 --num-envs 16
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml
import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import (
    CheckpointCallback,
    EvalCallback,
)
from stable_baselines3.common.vec_env import VecMonitor

# Ensure the package is importable when running from the scripts directory
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root / "src"))

from car_ai_rl.multi_agent import make_vec_env


def load_config(path: str | None) -> dict:
    if path is None:
        path = str(_project_root / "configs" / "default.yaml")
    with open(path) as f:
        return yaml.safe_load(f)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train PPO on Highway environment")
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to YAML config file (default: configs/default.yaml)",
    )
    parser.add_argument("--total-timesteps", type=int, default=None)
    parser.add_argument("--num-envs", type=int, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--checkpoint-dir", type=str, default=None)
    parser.add_argument("--log-dir", type=str, default=None)
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        help="Device for training: auto, cpu, cuda, mps",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.config)

    ppo_cfg = cfg["ppo"]
    policy_cfg = cfg["policy"]
    env_cfg = cfg["environment"]
    train_cfg = cfg["training"]

    total_timesteps = args.total_timesteps or train_cfg["total_timesteps"]
    num_envs = args.num_envs or env_cfg["num_envs"]
    seed = args.seed if args.seed is not None else train_cfg["seed"]
    checkpoint_dir = args.checkpoint_dir or train_cfg["checkpoint_dir"]
    log_dir = args.log_dir or train_cfg["log_dir"]

    os.makedirs(checkpoint_dir, exist_ok=True)
    os.makedirs(log_dir, exist_ok=True)

    print(f"Creating {num_envs} parallel environments...")
    vec_env = make_vec_env(
        num_envs=num_envs,
        seed=seed,
        use_subproc=num_envs > 1,
        max_episode_steps=env_cfg["max_episode_steps"],
        cruise_target_mph=env_cfg["cruise_target_mph"],
        initial_speed_mps=env_cfg["initial_speed_mps"],
    )
    vec_env = VecMonitor(vec_env)

    print("Creating evaluation environment...")
    eval_env = make_vec_env(
        num_envs=1,
        seed=seed + 1000,
        use_subproc=False,
        max_episode_steps=env_cfg["max_episode_steps"],
        cruise_target_mph=env_cfg["cruise_target_mph"],
        initial_speed_mps=env_cfg["initial_speed_mps"],
    )
    eval_env = VecMonitor(eval_env)

    activation_fn_map = {
        "tanh": torch.nn.Tanh,
        "relu": torch.nn.ReLU,
        "elu": torch.nn.ELU,
    }
    activation_fn = activation_fn_map.get(
        policy_cfg.get("activation_fn", "tanh"), torch.nn.Tanh
    )

    policy_kwargs = {
        "net_arch": policy_cfg["net_arch"],
        "activation_fn": activation_fn,
    }

    print("Initializing PPO model...")
    model = PPO(
        policy="MlpPolicy",
        env=vec_env,
        learning_rate=ppo_cfg["learning_rate"],
        n_steps=ppo_cfg["n_steps"],
        batch_size=ppo_cfg["batch_size"],
        n_epochs=ppo_cfg["n_epochs"],
        gamma=ppo_cfg["gamma"],
        gae_lambda=ppo_cfg["gae_lambda"],
        clip_range=ppo_cfg["clip_range"],
        clip_range_vf=ppo_cfg.get("clip_range_vf"),
        ent_coef=ppo_cfg["ent_coef"],
        vf_coef=ppo_cfg["vf_coef"],
        max_grad_norm=ppo_cfg["max_grad_norm"],
        policy_kwargs=policy_kwargs,
        tensorboard_log=log_dir,
        seed=seed,
        verbose=1,
        device=args.device,
    )

    checkpoint_callback = CheckpointCallback(
        save_freq=max(train_cfg["save_interval"] // num_envs, 1),
        save_path=checkpoint_dir,
        name_prefix="ppo_highway",
    )

    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=os.path.join(checkpoint_dir, "best"),
        log_path=log_dir,
        eval_freq=max(train_cfg["eval_freq"] // num_envs, 1),
        n_eval_episodes=train_cfg["eval_episodes"],
        deterministic=True,
    )

    print(f"Training for {total_timesteps} timesteps...")
    print(f"  PPO steps per update: {ppo_cfg['n_steps']}")
    print(f"  Minibatch size: {ppo_cfg['batch_size']}")
    print(f"  Num environments: {num_envs}")
    print(f"  Checkpoints: {checkpoint_dir}")
    print(f"  Tensorboard logs: {log_dir}")

    model.learn(
        total_timesteps=total_timesteps,
        callback=[checkpoint_callback, eval_callback],
        log_interval=train_cfg["log_interval"],
        progress_bar=True,
    )

    final_path = os.path.join(checkpoint_dir, "ppo_highway_final")
    model.save(final_path)
    print(f"Final model saved to {final_path}")

    vec_env.close()
    eval_env.close()


if __name__ == "__main__":
    main()
