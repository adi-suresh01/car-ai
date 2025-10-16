import numpy as np
from typing import Any


def evaluate(messages: list[dict], **kwargs: Any) -> dict:
    """Custom Fireworks evaluator for highway rollouts."""
    trajectory = kwargs.get("trajectory", {})
    steps = trajectory.get("steps", [])
    mission = trajectory.get("mission", {})
    controller = kwargs.get("controller", "unknown")

    if not steps:
        return {
            "score": 0.0,
            "is_score_valid": False,
            "reason": "No steps provided",
        }

    collisions = sum(1 for s in steps if s.get("collision", False))
    collision_rate = collisions / max(len(steps), 1)

    cruise_speed = mission.get("speed", None)
    speed_errors = []
    if cruise_speed is not None:
        for s in steps:
            speed_errors.append(abs(s.get("speed_mph", 0) - cruise_speed))
    avg_speed_error = float(np.mean(speed_errors)) if speed_errors else 0.0

    gap_target = mission.get("gap", None)
    gap_violations = []
    if gap_target is not None:
        for s in steps:
            gap_m = s.get("gap_m", gap_target)
            gap_violations.append(max(0.0, gap_target - gap_m))
    avg_gap_violation = float(np.mean(gap_violations)) if gap_violations else 0.0

    score = 1.0 - collision_rate - 0.001 * avg_speed_error - 0.001 * avg_gap_violation
    score = max(0.0, score)

    reason = (
        f"{controller}: collision_rate={collision_rate:.3f}, "
        f"avg_speed_err={avg_speed_error:.2f}, avg_gap_violation={avg_gap_violation:.2f}"
    )

    return {
        "score": score,
        "is_score_valid": True,
        "reason": reason,
    }
