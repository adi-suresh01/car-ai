"""VoiceDrive RL training pipeline.

Gymnasium environment mirroring the Rust physics engine, with PPO training
via stable-baselines3 and ONNX export for browser inference.
"""

from car_ai_rl.env import HighwayEnv
from car_ai_rl.observation import build_observation, OBSERVATION_DIM
from car_ai_rl.reward import compute_reward
from car_ai_rl.multi_agent import make_vec_env, make_multi_agent_env

__version__ = "0.1.0"
__all__ = [
    "HighwayEnv",
    "build_observation",
    "OBSERVATION_DIM",
    "compute_reward",
    "make_vec_env",
    "make_multi_agent_env",
]
