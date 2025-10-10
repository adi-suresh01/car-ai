"""Local PPO training script for the highway mission environment."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import VecMonitor

from car_ai_rl import HighwayEnvConfig, HighwayMissionEnv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a PPO policy for the car-ai highway sim")
    parser.add_argument("--steps", type=int, default=1_000_000, help="Total timesteps")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--log-dir", type=Path, default=Path("runs/ppo"), help="Logging directory")
    parser.add_argument("--checkpoint-every", type=int, default=200_000, help="Checkpoint interval")
    parser.add_argument("--n-envs", type=int, default=4, help="Number of vectorised environments")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.log_dir.mkdir(parents=True, exist_ok=True)

    def _make_env() -> HighwayMissionEnv:
        return HighwayMissionEnv(HighwayEnvConfig(seed=args.seed))

    vec_env = make_vec_env(_make_env, n_envs=args.n_envs)
    vec_env = VecMonitor(vec_env, filename=str(args.log_dir / "monitor.csv"))

    policy_kwargs = dict(
        activation_fn=torch.nn.ReLU,
        net_arch=dict(pi=[256, 256], vf=[256, 256]),
    )

    model = PPO(
        "MlpPolicy",
        vec_env,
        verbose=1,
        tensorboard_log=str(args.log_dir / "tb"),
        seed=args.seed,
        learning_rate=3e-4,
        n_steps=4096,
        batch_size=1024,
        n_epochs=10,
        gamma=0.995,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,
        policy_kwargs=policy_kwargs,
    )

    checkpoint_callback = CheckpointCallback(
        save_freq=max(args.checkpoint_every // args.n_envs, 1),
        save_path=str(args.log_dir / "checkpoints"),
        name_prefix="ppo-highway",
    )

    model.learn(total_timesteps=args.steps, callback=checkpoint_callback)
    final_path = args.log_dir / "ppo-highway-final"
    model.save(final_path)
    print(f"Saved final model to {final_path}")


if __name__ == "__main__":
    main()
