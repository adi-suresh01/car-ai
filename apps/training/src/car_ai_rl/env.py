from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces

MPH_TO_MPS = 0.44704
LANE_MODE_MAP = {"hold": 0, "cruise": 1, "lane_change": 2, "overtake": 3}
MODE_NAMES = {value: key for key, value in LANE_MODE_MAP.items()}


def mph_to_mps(mph: float) -> float:
    return mph * MPH_TO_MPS


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@dataclass
class TrafficVehicle:
    lane_index: int
    position_z: float
    speed_mps: float
    length_m: float = 4.8
    width_m: float = 1.9


@dataclass
class EgoState:
    lane_index: int
    lane_offset: float
    speed_mps: float
    position_z: float
    heading_rad: float


@dataclass
class MissionState:
    mode: str
    target_lane_index: Optional[int]
    cruise_speed_mps: float
    cruise_gap_m: float
    return_lane_index: Optional[int] = None
    lane_change_direction: Optional[str] = None


@dataclass
class HighwayEnvConfig:
    lane_count: int = 5
    lane_width_m: float = 3.6
    dt: float = 0.2
    horizon_seconds: float = 180.0
    max_speed_mps: float = mph_to_mps(90)
    max_accel_mps2: float = 3.6
    max_brake_mps2: float = 6.5
    coast_drag_mps2: float = 1.2
    seed: Optional[int] = None
    traffic_spawn_rate: float = 0.18  # vehicles per second per lane
    traffic_max_speed_mps: float = mph_to_mps(75)
    traffic_min_speed_mps: float = mph_to_mps(25)
    cruise_default_gap_m: float = 9.2  # roughly 2 car lengths
    mission_change_interval: Tuple[int, int] = (5, 15)  # steps before sampling new mission
    observation_clip_m: float = 150.0
    reward_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "progress": 1.0,
            "lane_alignment": 0.35,
            "lane_offset": 0.1,
            "comfort": 0.05,
            "rule_compliance": 0.4,
            "cruise_tracking": 0.04,
            "gap": 0.01,
            "collision": 25.0,
            "lane_change_cost": 0.2,
        },
    )


class HighwayMissionEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, config: Optional[HighwayEnvConfig] = None) -> None:
        super().__init__()
        self.cfg = config or HighwayEnvConfig()
        self.np_random, _ = gym.utils.seeding.np_random(self.cfg.seed)
        self.time_elapsed = 0.0

        # State
        self.ego = EgoState(
            lane_index=self.cfg.lane_count // 2,
            lane_offset=0.0,
            speed_mps=mph_to_mps(55),
            position_z=0.0,
            heading_rad=0.0,
        )
        self.mission = MissionState(
            mode="cruise",
            target_lane_index=self.ego.lane_index,
            cruise_speed_mps=mph_to_mps(60),
            cruise_gap_m=self.cfg.cruise_default_gap_m,
        )
        self.traffic: List[TrafficVehicle] = []
        self.steps_since_last_mission = 0
        self.lane_speed_limits = self._build_lane_speed_limits()

        # Observation: 12-dimensional vector
        high = np.array(
            [
                1.0,  # lane position normalized
                3.0,  # lateral offset in meters (clipped)
                self.cfg.max_speed_mps,
                self.cfg.max_speed_mps,
                self.cfg.max_speed_mps,
                self.cfg.observation_clip_m,
                self.cfg.observation_clip_m,
                30.0,  # relative speed ahead
                30.0,  # relative speed behind
                1.0,  # target lane normalized
                3.0,  # mission mode id
                1.0,  # lane change direction
            ],
            dtype=np.float32,
        )
        self.observation_space = spaces.Box(low=-high, high=high, dtype=np.float32)

        # Actions: throttle [0,1], brake [0,1], lane request [-1,1]
        self.action_space = spaces.Box(
            low=np.array([0.0, 0.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )

    # Gym API -------------------------------------------------------------------------------------
    def reset(  # type: ignore[override]
        self,
        *,
        seed: Optional[int] = None,
        options: Optional[Dict] = None,
    ) -> Tuple[np.ndarray, Dict]:
        if seed is not None:
            self.np_random, _ = gym.utils.seeding.np_random(seed)
        self.time_elapsed = 0.0
        self.steps_since_last_mission = 0

        self.ego = EgoState(
            lane_index=self.cfg.lane_count // 2,
            lane_offset=0.0,
            speed_mps=mph_to_mps(55),
            position_z=0.0,
            heading_rad=0.0,
        )
        self.traffic = self._seed_initial_traffic()
        self.mission = self._sample_mission(initial=True)

        observation = self._build_observation()
        return observation, self._info(done=False, collision=False, lane_change=False)

    def step(self, action: np.ndarray):  # type: ignore[override]
        throttle = float(clamp(action[0], 0.0, 1.0))
        brake = float(clamp(action[1], 0.0, 1.0))
        lane_cmd = float(clamp(action[2], -1.0, 1.0))

        requested_lane = self._lane_request_from_action(lane_cmd)

        net_accel = (
            throttle * self.cfg.max_accel_mps2
            - brake * self.cfg.max_brake_mps2
            - self.cfg.coast_drag_mps2 * (0.0 if throttle > 0.05 else 1.0)
        )
        self.ego.speed_mps = clamp(
            self.ego.speed_mps + net_accel * self.cfg.dt,
            0.0,
            self.cfg.max_speed_mps,
        )
        self.ego.position_z += self.ego.speed_mps * self.cfg.dt

        lane_changed = self._apply_lane_change(requested_lane)
        self._update_traffic()
        collision = self._detect_collision()

        self.time_elapsed += self.cfg.dt
        self.steps_since_last_mission += 1

        observation = self._build_observation()
        reward, reward_terms = self._compute_reward(
            observation,
            net_accel=net_accel,
            lane_changed=lane_changed,
            collision=collision,
        )
        terminated = collision
        truncated = self.time_elapsed >= self.cfg.horizon_seconds

        if self.steps_since_last_mission >= self._mission_interval():
            self.mission = self._sample_mission()
            self.steps_since_last_mission = 0

        info = self._info(
            done=terminated or truncated,
            collision=collision,
            lane_change=lane_changed,
            reward_terms=reward_terms,
        )
        return observation, reward, terminated, truncated, info

    # Internal helpers ----------------------------------------------------------------------------
    def _lane_request_from_action(self, lane_cmd: float) -> int:
        threshold = 0.35
        if lane_cmd > threshold:
            return min(self.ego.lane_index + 1, self.cfg.lane_count - 1)
        if lane_cmd < -threshold:
            return max(self.ego.lane_index - 1, 0)
        if self.mission.mode in {"lane_change", "overtake"} and self.mission.target_lane_index is not None:
            return self.mission.target_lane_index
        return self.ego.lane_index

    def _apply_lane_change(self, requested_lane: int) -> bool:
        if requested_lane == self.ego.lane_index:
            self.ego.lane_offset *= 0.6
            return False

        direction = 1 if requested_lane > self.ego.lane_index else -1
        self.ego.lane_offset += direction * (self.cfg.lane_width_m / 1.0) * self.cfg.dt
        lane_crossed = abs(self.ego.lane_offset) >= self.cfg.lane_width_m * 0.5
        if lane_crossed:
            self.ego.lane_index = clamp(self.ego.lane_index + direction, 0, self.cfg.lane_count - 1)
            self.ego.lane_offset = 0.0
            if self.mission.mode == "lane_change" and self.mission.target_lane_index == self.ego.lane_index:
                self.mission.mode = "hold"
            if (
                self.mission.mode == "overtake"
                and self.mission.return_lane_index is not None
                and self.mission.target_lane_index == self.ego.lane_index
            ):
                # After overtaking, set mission to return lane
                self.mission.mode = "lane_change"
                self.mission.target_lane_index = clamp(
                    self.mission.return_lane_index,
                    0,
                    self.cfg.lane_count - 1,
                )
        else:
            self.ego.heading_rad = direction * math.radians(12) * self.ego.lane_offset
        return lane_crossed

    def _update_traffic(self) -> None:
        # move each vehicle
        for vehicle in self.traffic:
            vehicle.position_z += vehicle.speed_mps * self.cfg.dt

        # remove distant vehicles
        max_distance = self.ego.position_z + 400.0
        min_distance = self.ego.position_z - 200.0
        self.traffic = [
            vehicle for vehicle in self.traffic if min_distance <= vehicle.position_z <= max_distance
        ]

        # spawn new vehicles ahead occasionally
        spawn_prob = self.cfg.traffic_spawn_rate * self.cfg.dt
        for lane in range(self.cfg.lane_count):
            if self.np_random.random() < spawn_prob:
                speed = self.np_random.uniform(
                    self.cfg.traffic_min_speed_mps,
                    self.cfg.traffic_max_speed_mps,
                )
                position = self.ego.position_z + self.np_random.uniform(120.0, 320.0)
                self.traffic.append(
                    TrafficVehicle(
                        lane_index=lane,
                        position_z=position,
                        speed_mps=speed,
                    ),
                )

    def _detect_collision(self) -> bool:
        ego_length = 4.6
        ego_width = 1.9
        for vehicle in self.traffic:
            if vehicle.lane_index != self.ego.lane_index:
                continue
            longitudinal_gap = abs(vehicle.position_z - self.ego.position_z)
            min_gap = ego_length * 0.5 + vehicle.length_m * 0.5 + 2.0
            if longitudinal_gap > min_gap:
                continue
            lateral_gap = abs(self.ego.lane_offset)
            if lateral_gap < ego_width * 0.5 + vehicle.width_m * 0.5:
                return True
        return False

    def _compute_reward(
        self,
        observation: np.ndarray,
        *,
        net_accel: float,
        lane_changed: bool,
        collision: bool,
    ) -> Tuple[float, Dict[str, float]]:
        weights = self.cfg.reward_weights
        progress = observation[2] * self.cfg.dt  # speed_mps

        lane_alignment = 0.0
        if self.mission.target_lane_index is not None:
            diff = abs(self.mission.target_lane_index - self.ego.lane_index)
            lane_alignment = -diff

        lane_offset_penalty = -abs(self.ego.lane_offset)
        comfort_penalty = -abs(net_accel)
        rule_compliance = 0.2 if self.ego.speed_mps <= self.mission.cruise_speed_mps * 1.1 else -0.4

        cruise_tracking = -abs(self.ego.speed_mps - self.mission.cruise_speed_mps)

        gap_ahead = observation[5]
        gap_penalty = -abs(gap_ahead - self.mission.cruise_gap_m)
        collision_penalty = -weights["collision"] if collision else 0.0
        lane_change_cost = -weights["lane_change_cost"] if lane_changed else 0.0

        total = (
            weights["progress"] * progress
            + weights["lane_alignment"] * lane_alignment
            + weights["lane_offset"] * lane_offset_penalty
            + weights["comfort"] * comfort_penalty
            + weights["rule_compliance"] * rule_compliance
            + weights["cruise_tracking"] * cruise_tracking
            + weights["gap"] * gap_penalty
            + collision_penalty
            + lane_change_cost
        )

        reward_terms = {
            "progress": progress,
            "lane_alignment": lane_alignment,
            "lane_offset": lane_offset_penalty,
            "comfort": comfort_penalty,
            "rule": rule_compliance,
            "cruise": cruise_tracking,
            "gap": gap_penalty,
            "collision": collision_penalty,
            "lane_change": lane_change_cost,
        }
        return total, reward_terms

    def _build_observation(self) -> np.ndarray:
        mid_lane = (self.cfg.lane_count - 1) / 2
        lane_position_norm = (self.ego.lane_index - mid_lane) / max(mid_lane, 1.0)

        target_lane_norm = 0.0
        if self.mission.target_lane_index is not None:
            target_lane_norm = (self.mission.target_lane_index - mid_lane) / max(mid_lane, 1.0)

        mode_id = LANE_MODE_MAP.get(self.mission.mode, 0)
        lane_change_dir = 0.0
        if self.mission.lane_change_direction == "left":
            lane_change_dir = -1.0
        elif self.mission.lane_change_direction == "right":
            lane_change_dir = 1.0

        gap_ahead, gap_behind, rel_speed_ahead, rel_speed_behind = self._gap_metrics()
        lane_speed_limit = self.lane_speed_limits[self.ego.lane_index]

        obs = np.array(
            [
                lane_position_norm,
                clamp(self.ego.lane_offset, -3.0, 3.0),
                self.ego.speed_mps,
                lane_speed_limit,
                self.mission.cruise_speed_mps,
                gap_ahead,
                gap_behind,
                rel_speed_ahead,
                rel_speed_behind,
                target_lane_norm,
                float(mode_id),
                lane_change_dir,
            ],
            dtype=np.float32,
        )
        return obs

    def _gap_metrics(self) -> Tuple[float, float, float, float]:
        gap_ahead = self.cfg.observation_clip_m
        gap_behind = self.cfg.observation_clip_m
        rel_speed_ahead = 0.0
        rel_speed_behind = 0.0

        ahead_candidates = [
            v
            for v in self.traffic
            if v.lane_index == self.ego.lane_index and v.position_z > self.ego.position_z
        ]
        behind_candidates = [
            v
            for v in self.traffic
            if v.lane_index == self.ego.lane_index and v.position_z < self.ego.position_z
        ]
        if ahead_candidates:
            nearest_ahead = min(ahead_candidates, key=lambda v: v.position_z)
            gap_ahead = clamp(
                nearest_ahead.position_z - self.ego.position_z - nearest_ahead.length_m * 0.5,
                -self.cfg.observation_clip_m,
                self.cfg.observation_clip_m,
            )
            rel_speed_ahead = clamp(nearest_ahead.speed_mps - self.ego.speed_mps, -30.0, 30.0)
        if behind_candidates:
            nearest_behind = max(behind_candidates, key=lambda v: v.position_z)
            gap_behind = clamp(
                self.ego.position_z - nearest_behind.position_z - nearest_behind.length_m * 0.5,
                -self.cfg.observation_clip_m,
                self.cfg.observation_clip_m,
            )
            rel_speed_behind = clamp(nearest_behind.speed_mps - self.ego.speed_mps, -30.0, 30.0)

        return gap_ahead, gap_behind, rel_speed_ahead, rel_speed_behind

    def _seed_initial_traffic(self) -> List[TrafficVehicle]:
        vehicles: List[TrafficVehicle] = []
        for lane in range(self.cfg.lane_count):
            for _ in range(3):
                position = self.np_random.uniform(-120.0, 220.0) + self.ego.position_z
                if abs(position) < 15.0:
                    continue
                speed = self.np_random.uniform(
                    self.cfg.traffic_min_speed_mps,
                    self.cfg.traffic_max_speed_mps,
                )
                vehicles.append(
                    TrafficVehicle(
                        lane_index=lane,
                        position_z=position,
                        speed_mps=speed,
                    ),
                )
        return vehicles

    def _build_lane_speed_limits(self) -> List[float]:
        # Express lanes on the left slightly faster than exit lanes on the right
        left_speed = mph_to_mps(70)
        right_speed = mph_to_mps(55)
        if self.cfg.lane_count == 1:
            return [mph_to_mps(60)]
        return list(np.linspace(left_speed, right_speed, self.cfg.lane_count))

    def _sample_mission(self, initial: bool = False) -> MissionState:
        candidate_modes = ["cruise", "lane_change", "overtake"]
        if initial:
            mode = "cruise"
        else:
            mode = random.choice(candidate_modes)

        target_lane = self.ego.lane_index
        lane_change_direction: Optional[str] = None
        return_lane = None
        if mode in {"lane_change", "overtake"}:
            direction = random.choice([-1, 1])
            lane_change_direction = "left" if direction < 0 else "right"
            target_lane = clamp(self.ego.lane_index + direction, 0, self.cfg.lane_count - 1)
            if mode == "overtake":
                return_lane = self.ego.lane_index

        cruise_speed = clamp(
            self.np_random.normal(mph_to_mps(60), mph_to_mps(5)),
            mph_to_mps(35),
            mph_to_mps(80),
        )
        cruise_gap = clamp(
            self.cfg.cruise_default_gap_m + self.np_random.normal(0.0, 2.5),
            6.0,
            20.0,
        )
        return MissionState(
            mode=mode,
            target_lane_index=target_lane,
            cruise_speed_mps=cruise_speed,
            cruise_gap_m=cruise_gap,
            return_lane_index=return_lane,
            lane_change_direction=lane_change_direction,
        )

    def _mission_interval(self) -> int:
        low, high = self.cfg.mission_change_interval
        return self.np_random.integers(low, high)

    def _info(
        self,
        *,
        done: bool,
        collision: bool,
        lane_change: bool,
        reward_terms: Optional[Dict[str, float]] = None,
    ) -> Dict:
        return {
            "episode_time": self.time_elapsed,
            "collision": collision,
            "lane_change": lane_change,
            "mission": {
                "mode": self.mission.mode,
                "target_lane_index": self.mission.target_lane_index,
                "return_lane_index": self.mission.return_lane_index,
                "cruise_speed_mps": self.mission.cruise_speed_mps,
                "cruise_gap_m": self.mission.cruise_gap_m,
            },
            "reward_terms": reward_terms or {},
            "terminated": done,
        }
