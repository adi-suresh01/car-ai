"""Multi-agent wrapper for parallel training.

Provides utilities to create vectorized environments using
stable-baselines3's SubprocVecEnv for parallel PPO training,
and a multi-agent wrapper where each NPC can be trained with
its own observation/action space.
"""

from __future__ import annotations

from typing import Any, Callable

import gymnasium as gym
import numpy as np
from stable_baselines3.common.vec_env import SubprocVecEnv, DummyVecEnv

from car_ai_rl.env import HighwayEnv
from car_ai_rl.observation import OBSERVATION_DIM


def _make_env(
    rank: int,
    seed: int,
    max_episode_steps: int = 3600,
    cruise_target_mph: float = 65.0,
    initial_speed_mps: float = 29.0,
) -> Callable[[], HighwayEnv]:
    """Create a factory function for a single environment instance."""
    def _init() -> HighwayEnv:
        env = HighwayEnv(
            max_episode_steps=max_episode_steps,
            cruise_target_mph=cruise_target_mph,
            initial_speed_mps=initial_speed_mps,
            seed=seed + rank,
        )
        return env
    return _init


def make_vec_env(
    num_envs: int = 8,
    seed: int = 42,
    use_subproc: bool = True,
    max_episode_steps: int = 3600,
    cruise_target_mph: float = 65.0,
    initial_speed_mps: float = 29.0,
) -> SubprocVecEnv | DummyVecEnv:
    """Create a vectorized environment for parallel training.

    Args:
        num_envs: Number of parallel environment instances.
        seed: Base random seed (each env gets seed + rank).
        use_subproc: If True, use SubprocVecEnv for true parallelism.
            If False, use DummyVecEnv (sequential, useful for debugging).
        max_episode_steps: Maximum steps per episode before truncation.
        cruise_target_mph: Default cruise control target speed.
        initial_speed_mps: Player starting speed in m/s.

    Returns:
        A vectorized environment compatible with stable-baselines3.
    """
    env_fns = [
        _make_env(
            rank=i,
            seed=seed,
            max_episode_steps=max_episode_steps,
            cruise_target_mph=cruise_target_mph,
            initial_speed_mps=initial_speed_mps,
        )
        for i in range(num_envs)
    ]
    if use_subproc and num_envs > 1:
        return SubprocVecEnv(env_fns)
    return DummyVecEnv(env_fns)


class MultiAgentHighwayEnv(gym.Env):
    """Multi-agent wrapper where each NPC is a separate trainable agent.

    Each agent receives its own observation (from its vehicle's perspective)
    and produces its own action. This enables training diverse NPC policies.

    The environment steps all agents simultaneously, returning observations,
    rewards, and done flags for each agent in dict-keyed format.
    """

    metadata = {"render_modes": ["human"], "render_fps": 60}

    def __init__(
        self,
        num_agents: int = 4,
        max_episode_steps: int = 3600,
        seed: int | None = None,
    ) -> None:
        super().__init__()
        self.num_agents = num_agents
        self.max_episode_steps = max_episode_steps

        self.observation_space = gym.spaces.Box(
            low=-1.0, high=1.0, shape=(OBSERVATION_DIM,), dtype=np.float32
        )
        self.action_space = gym.spaces.Box(
            low=np.array([0.0, 0.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )

        self._envs = [
            HighwayEnv(
                max_episode_steps=max_episode_steps,
                seed=(seed + i) if seed is not None else None,
            )
            for i in range(num_agents)
        ]
        self._episode_step = 0

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        self._episode_step = 0
        all_obs = []
        for i, env in enumerate(self._envs):
            env_seed = (seed + i) if seed is not None else None
            obs, _ = env.reset(seed=env_seed)
            all_obs.append(obs)
        stacked = np.stack(all_obs, axis=0)
        return stacked, {"num_agents": self.num_agents}

    def step(
        self, actions: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
        """Step all agents simultaneously.

        Args:
            actions: Array of shape (num_agents, 3).

        Returns:
            observations: (num_agents, 12)
            rewards: (num_agents,)
            dones: (num_agents,)
            truncateds: (num_agents,)
            infos: dict with per-agent info
        """
        all_obs = []
        all_rewards = []
        all_dones = []
        all_truncateds = []
        all_infos: dict[str, list[Any]] = {
            "collision": [],
            "speed_mph": [],
        }

        for i, env in enumerate(self._envs):
            obs, reward, done, truncated, info = env.step(actions[i])
            if done or truncated:
                obs, _ = env.reset()
            all_obs.append(obs)
            all_rewards.append(reward)
            all_dones.append(done)
            all_truncateds.append(truncated)
            all_infos["collision"].append(info.get("collision", False))
            all_infos["speed_mph"].append(info.get("speed_mph", 0.0))

        self._episode_step += 1
        return (
            np.stack(all_obs, axis=0),
            np.array(all_rewards, dtype=np.float32),
            np.array(all_dones, dtype=bool),
            np.array(all_truncateds, dtype=bool),
            all_infos,
        )


def make_multi_agent_env(
    num_agents: int = 4,
    max_episode_steps: int = 3600,
    seed: int | None = None,
) -> MultiAgentHighwayEnv:
    """Create a multi-agent highway environment."""
    return MultiAgentHighwayEnv(
        num_agents=num_agents,
        max_episode_steps=max_episode_steps,
        seed=seed,
    )
