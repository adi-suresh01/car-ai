"""Reward function mirroring the Rust implementation.

Must match backend/src/rl/reward.rs compute_reward() exactly.

Components and weights:
  progress:          (position_z - prev_z) * 0.01          weight 1.0
  lane_keeping:      1 - min(|lateral_offset| / LANE_WIDTH, 1)  weight 0.3
  comfort:           1 - min(|steer_change| / MAX_STEER, 1)     weight 0.1
  collision_penalty:  -10 if collision else 0                    weight 1.0
  speed_match:       1 - min(|speed - target| / target, 1)      weight 0.5
"""

from __future__ import annotations

from dataclasses import dataclass

from car_ai_rl.constants import (
    LANE_WIDTH_METERS,
    MAX_SPEED_MPH,
    MAX_STEER_DEG,
    MPH_TO_MPS,
)


@dataclass(frozen=True)
class RewardComponents:
    progress: float
    lane_keeping: float
    comfort: float
    collision_penalty: float
    speed_match: float
    total: float


def compute_reward(
    position_z: float,
    prev_z: float,
    lateral_offset: float,
    steer_angle_deg: float,
    prev_steer_deg: float,
    speed_mps: float,
    cruise_target_mph: float,
    collision: bool,
) -> RewardComponents:
    """Compute the shaped reward matching Rust exactly."""
    progress = (position_z - prev_z) * 0.01

    lateral_error = abs(lateral_offset) / LANE_WIDTH_METERS
    lane_keeping = 1.0 - min(lateral_error, 1.0)

    steer_change = abs(steer_angle_deg - prev_steer_deg) / MAX_STEER_DEG
    comfort = 1.0 - min(steer_change, 1.0)

    collision_penalty = -10.0 if collision else 0.0

    target_mps = cruise_target_mph * MPH_TO_MPS
    speed_error = abs(speed_mps - target_mps) / max(target_mps, 1.0)
    speed_match = 1.0 - min(speed_error, 1.0)

    total = (
        progress * 1.0
        + lane_keeping * 0.3
        + comfort * 0.1
        + collision_penalty
        + speed_match * 0.5
    )

    return RewardComponents(
        progress=progress,
        lane_keeping=lane_keeping,
        comfort=comfort,
        collision_penalty=collision_penalty,
        speed_match=speed_match,
        total=total,
    )
