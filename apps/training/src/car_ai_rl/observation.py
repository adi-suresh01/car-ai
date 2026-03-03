"""Observation space builder.

Builds the 12-dimensional observation vector matching the Rust RLObservation
type. All values are normalized to approximately [-1, 1] for stable training.

Field order (must match Rust observation.rs to_vec()):
  0: lanePosition     - lane index normalized by (NUM_LANES - 1)
  1: lateralOffset    - offset / LANE_WIDTH_METERS
  2: speed            - speed_mps / max_speed_mps
  3: targetSpeed      - cruise_target_mph / MAX_SPEED_MPH
  4: gapAhead         - min(gap, 200) / 200
  5: gapBehind        - min(gap, 200) / 200
  6: relSpeedAhead    - clamp(rel_speed / 20, -1, 1)
  7: relSpeedBehind   - clamp(rel_speed / 20, -1, 1)
  8: missionMode      - mode_index / 3
  9: targetLane       - target_lane / (NUM_LANES - 1)
 10: laneChangeDir    - {left: -1, none: 0, right: 1}
 11: crossLaneGap     - min(gap, 200) / 200
"""

from __future__ import annotations

import numpy as np

from car_ai_rl.constants import (
    LANE_WIDTH_METERS,
    MAX_SPEED_MPH,
    MPH_TO_MPS,
    NUM_LANES,
)

OBSERVATION_DIM = 12
MAX_GAP = 200.0
REL_SPEED_SCALE = 20.0


def build_observation(
    lane_index: int,
    lateral_offset: float,
    speed_mps: float,
    cruise_target_mph: float,
    gap_ahead: float,
    gap_behind: float,
    rel_speed_ahead: float,
    rel_speed_behind: float,
    mission_mode: int,
    target_lane: int,
    lane_change_dir: float,
    cross_lane_gap: float,
) -> np.ndarray:
    """Build a normalized 12-dim observation vector matching Rust exactly."""
    max_speed_mps = MAX_SPEED_MPH * MPH_TO_MPS
    obs = np.array(
        [
            lane_index / (NUM_LANES - 1),
            lateral_offset / LANE_WIDTH_METERS,
            speed_mps / max_speed_mps,
            cruise_target_mph / MAX_SPEED_MPH,
            min(gap_ahead, MAX_GAP) / MAX_GAP,
            min(gap_behind, MAX_GAP) / MAX_GAP,
            np.clip(rel_speed_ahead / REL_SPEED_SCALE, -1.0, 1.0),
            np.clip(rel_speed_behind / REL_SPEED_SCALE, -1.0, 1.0),
            mission_mode / 3.0,
            target_lane / (NUM_LANES - 1),
            lane_change_dir,
            min(cross_lane_gap, MAX_GAP) / MAX_GAP,
        ],
        dtype=np.float32,
    )
    return obs
