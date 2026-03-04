"""Physics constants shared with the Rust backend.

These values MUST match backend/src/config.rs exactly.
"""

LANE_WIDTH_METERS: float = 3.6
WHEELBASE_METERS: float = 2.8
MAX_SPEED_MPH: float = 120.0
MAX_STEER_DEG: float = 38.0
STEER_RATE_DEG_PER_S: float = 140.0
PHYSICS_HZ: int = 60
PHYSICS_DT: float = 1.0 / 60.0
ROLLING_RESIST_MPS2: float = 0.15
AERO_DRAG_COEFF: float = 0.0032
BRAKE_RATE_MPH_PER_S: float = 90.0

MPH_TO_MPS: float = 0.44704
MPS_TO_MPH: float = 1.0 / MPH_TO_MPS

NPC_DESPAWN_DISTANCE: float = 1200.0
NPC_SPAWN_DISTANCE: float = -320.0

NUM_LANES: int = 5

TARGET_NPC_COUNT: int = 12

THROTTLE_ACCEL_FACTOR: float = 6.0

LANE_SPEED_LIMITS_MPH: dict[int, float] = {
    0: 75.0,
    1: 70.0,
    2: 65.0,
    3: 60.0,
    4: 55.0,
}
