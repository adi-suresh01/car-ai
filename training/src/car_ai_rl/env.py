"""Gymnasium environment mirroring the Rust physics engine exactly.

Vehicle dynamics use the bicycle model with identical constants from CLAUDE.md.
The observation and reward functions match the Rust implementations field-for-field.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from car_ai_rl.constants import (
    AERO_DRAG_COEFF,
    BRAKE_RATE_MPH_PER_S,
    LANE_SPEED_LIMITS_MPH,
    LANE_WIDTH_METERS,
    MAX_SPEED_MPH,
    MAX_STEER_DEG,
    MPH_TO_MPS,
    MPS_TO_MPH,
    NPC_DESPAWN_DISTANCE,
    NPC_SPAWN_DISTANCE,
    NUM_LANES,
    PHYSICS_DT,
    ROLLING_RESIST_MPS2,
    STEER_RATE_DEG_PER_S,
    TARGET_NPC_COUNT,
    THROTTLE_ACCEL_FACTOR,
    WHEELBASE_METERS,
)
from car_ai_rl.observation import OBSERVATION_DIM, build_observation
from car_ai_rl.reward import compute_reward


# ---------------------------------------------------------------------------
# Data structures mirroring Rust
# ---------------------------------------------------------------------------

def lane_center(index: int) -> float:
    return float(index) * LANE_WIDTH_METERS


def closest_lane(x: float) -> int:
    lane_f = round(x / LANE_WIDTH_METERS)
    return int(max(0, min(lane_f, NUM_LANES - 1)))


@dataclass
class Vehicle:
    id: str
    lane_index: int
    lateral_offset: float = 0.0
    speed_mps: float = 0.0
    steer_angle_deg: float = 0.0
    heading_rad: float = 0.0
    position_x: float = 0.0
    position_z: float = 0.0
    throttle: float = 0.0
    brake: float = 0.0
    length: float = 4.5
    width: float = 1.8

    def __post_init__(self) -> None:
        if self.position_x == 0.0:
            self.position_x = lane_center(self.lane_index)

    def speed_mph(self) -> float:
        return self.speed_mps * MPS_TO_MPH

    def step(self, dt: float) -> None:
        """Bicycle model physics step -- mirrors Vehicle::step() in Rust."""
        max_speed_mps = MAX_SPEED_MPH * MPH_TO_MPS

        accel = self.throttle * THROTTLE_ACCEL_FACTOR
        decel = self.brake * BRAKE_RATE_MPH_PER_S * MPH_TO_MPS
        drag = AERO_DRAG_COEFF * self.speed_mps * self.speed_mps
        rolling = ROLLING_RESIST_MPS2 if self.speed_mps > 0.01 else 0.0

        net_accel = accel - decel - drag - rolling
        self.speed_mps = max(0.0, min(self.speed_mps + net_accel * dt, max_speed_mps))

        steer_rad = math.radians(self.steer_angle_deg)
        if WHEELBASE_METERS > 0.0:
            turn_rate = (self.speed_mps / WHEELBASE_METERS) * math.tan(steer_rad)
            self.heading_rad += turn_rate * dt

        self.position_x += self.speed_mps * math.sin(self.heading_rad) * dt
        self.position_z += self.speed_mps * math.cos(self.heading_rad) * dt

        target_x = lane_center(self.lane_index)
        self.lateral_offset = self.position_x - target_x

        self.lane_index = closest_lane(self.position_x)

    def bounding_box(self) -> tuple[float, float, float, float]:
        half_l = self.length / 2.0
        half_w = self.width / 2.0
        return (
            self.position_x - half_w,
            self.position_z - half_l,
            self.position_x + half_w,
            self.position_z + half_l,
        )


def aabb_overlap(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def check_player_collisions(player: Vehicle, npcs: list[Vehicle]) -> bool:
    player_bb = player.bounding_box()
    for npc in npcs:
        if aabb_overlap(player_bb, npc.bounding_box()):
            return True
    return False


def gap_to_vehicle_ahead(
    reference: Vehicle,
    lane_index: int,
    vehicles: list[Vehicle],
) -> tuple[float, float]:
    min_gap = float("inf")
    rel_speed = 0.0
    for v in vehicles:
        if v.id == reference.id:
            continue
        if v.lane_index != lane_index:
            continue
        dz = v.position_z - reference.position_z
        if 0.0 < dz < min_gap:
            min_gap = dz
            rel_speed = v.speed_mps - reference.speed_mps
    return min_gap, rel_speed


def gap_to_vehicle_behind(
    reference: Vehicle,
    lane_index: int,
    vehicles: list[Vehicle],
) -> tuple[float, float]:
    min_gap = float("inf")
    rel_speed = 0.0
    for v in vehicles:
        if v.id == reference.id:
            continue
        if v.lane_index != lane_index:
            continue
        dz = reference.position_z - v.position_z
        if 0.0 < dz < min_gap:
            min_gap = dz
            rel_speed = reference.speed_mps - v.speed_mps
    return min_gap, rel_speed


# ---------------------------------------------------------------------------
# Mission state (simplified for training)
# ---------------------------------------------------------------------------

HOLD = 0
CRUISE = 1
LANE_CHANGE = 2
OVERTAKE = 3


@dataclass
class MissionState:
    mode: int = HOLD
    target_lane_index: int = 2
    cruise_target_speed_mph: float = 65.0
    cruise_gap_meters: float = 32.0
    return_lane_index: int | None = None
    lane_change_direction: float = 0.0  # -1 left, 0 none, 1 right


# ---------------------------------------------------------------------------
# NPC traffic (simplified for training speed)
# ---------------------------------------------------------------------------

@dataclass
class NpcState:
    target_speed_mps: float = 0.0
    following_gap: float = 30.0
    throttle_gain: float = 0.25


class TrafficManager:
    def __init__(self, rng: np.random.Generator) -> None:
        self._rng = rng
        self._npc_states: list[NpcState] = []
        self._next_id: int = 1

    def spawn_initial(self, npcs: list[Vehicle]) -> None:
        for i in range(TARGET_NPC_COUNT):
            lane = i % NUM_LANES
            z_offset = float(i) * 80.0 - 200.0
            self._spawn_npc(npcs, lane, z_offset)

    def tick(self, player_z: float, npcs: list[Vehicle]) -> None:
        self._despawn_distant(player_z, npcs)
        while len(npcs) < TARGET_NPC_COUNT:
            lane = int(self._rng.integers(0, NUM_LANES))
            z = player_z + NPC_SPAWN_DISTANCE - self._rng.uniform(0.0, 200.0)
            self._spawn_npc(npcs, lane, z)
        self._update_npc_behavior(npcs)

    def reset(self, npcs: list[Vehicle]) -> None:
        npcs.clear()
        self._npc_states.clear()
        self.spawn_initial(npcs)

    def _spawn_npc(self, npcs: list[Vehicle], lane: int, z: float) -> None:
        npc_id = f"npc-{self._next_id:03d}"
        self._next_id += 1

        npc = Vehicle(
            id=npc_id,
            lane_index=lane,
            position_x=lane_center(lane),
            position_z=z,
        )

        base_speed = LANE_SPEED_LIMITS_MPH.get(lane, 55.0) * MPH_TO_MPS
        variance = self._rng.uniform(-3.0, 3.0) * MPH_TO_MPS
        npc.speed_mps = max(base_speed + variance, 10.0 * MPH_TO_MPS)

        profile_roll = int(self._rng.integers(0, 3))
        if profile_roll == 0:
            throttle_gain, following_gap = 0.25, 30.0
        elif profile_roll == 1:
            throttle_gain, following_gap = 0.40, 18.0
        else:
            throttle_gain, following_gap = 0.15, 45.0

        target_speed = max(
            base_speed + self._rng.uniform(-3.0, 3.0) * MPH_TO_MPS,
            10.0 * MPH_TO_MPS,
        )

        npcs.append(npc)
        self._npc_states.append(
            NpcState(
                target_speed_mps=target_speed,
                following_gap=following_gap,
                throttle_gain=throttle_gain,
            )
        )

    def _despawn_distant(self, player_z: float, npcs: list[Vehicle]) -> None:
        i = 0
        while i < len(npcs):
            dist = abs(npcs[i].position_z - player_z)
            if dist > NPC_DESPAWN_DISTANCE:
                npcs[i] = npcs[-1]
                npcs.pop()
                self._npc_states[i] = self._npc_states[-1]
                self._npc_states.pop()
            else:
                i += 1

    def _update_npc_behavior(self, npcs: list[Vehicle]) -> None:
        for i in range(min(len(npcs), len(self._npc_states))):
            lane = npcs[i].lane_index
            state = self._npc_states[i]

            lane_limit = LANE_SPEED_LIMITS_MPH.get(lane, 55.0) * MPH_TO_MPS
            effective_target = min(state.target_speed_mps, lane_limit)

            gap_ahead, _ = gap_to_vehicle_ahead(npcs[i], lane, npcs)

            if gap_ahead < state.following_gap:
                npcs[i].throttle = 0.0
                npcs[i].brake = 0.15
            else:
                speed_error = effective_target - npcs[i].speed_mps
                if speed_error > 0.5:
                    npcs[i].throttle = min(speed_error * state.throttle_gain, 0.8)
                    npcs[i].brake = 0.0
                elif speed_error < -0.5:
                    npcs[i].throttle = 0.0
                    npcs[i].brake = min(abs(speed_error) * 0.1, 0.5)
                else:
                    npcs[i].throttle = 0.02
                    npcs[i].brake = 0.0

            target_x = lane_center(lane)
            lateral_error = target_x - npcs[i].position_x
            npcs[i].steer_angle_deg = max(
                -MAX_STEER_DEG, min(lateral_error * 5.0, MAX_STEER_DEG)
            )


# ---------------------------------------------------------------------------
# Mission control (mirrors World::apply_mission_control in Rust)
# ---------------------------------------------------------------------------

def _steer_toward_lane(player: Vehicle, target_lane: int, dt: float) -> None:
    target_x = lane_center(target_lane)
    lateral_error = target_x - player.position_x
    desired_steer = max(-MAX_STEER_DEG, min(lateral_error * 8.0, MAX_STEER_DEG))
    steer_delta = desired_steer - player.steer_angle_deg
    max_delta = STEER_RATE_DEG_PER_S * dt
    player.steer_angle_deg += max(-max_delta, min(steer_delta, max_delta))


def apply_mission_control(player: Vehicle, mission: MissionState, dt: float) -> None:
    """Apply mission control logic to the player vehicle, mirroring Rust."""
    if mission.mode == HOLD:
        player.throttle = 0.0
        if player.speed_mps > 0.0:
            player.brake = 0.3
        else:
            player.brake = 0.0

    elif mission.mode == CRUISE:
        target_mps = mission.cruise_target_speed_mph * MPH_TO_MPS
        speed_error = target_mps - player.speed_mps
        if speed_error > 1.0:
            player.throttle = min(speed_error * 0.3, 1.0)
            player.brake = 0.0
        elif speed_error < -1.0:
            player.throttle = 0.0
            player.brake = min(abs(speed_error) * 0.2, 1.0)
        else:
            player.throttle = 0.05
            player.brake = 0.0
        _steer_toward_lane(player, mission.target_lane_index, dt)

    elif mission.mode == LANE_CHANGE:
        target_mps = mission.cruise_target_speed_mph * MPH_TO_MPS
        speed_error = target_mps - player.speed_mps
        if speed_error > 0.5:
            player.throttle = min(speed_error * 0.3, 1.0)
            player.brake = 0.0
        elif speed_error < -0.5:
            player.throttle = 0.0
            player.brake = min(abs(speed_error) * 0.2, 1.0)
        else:
            player.throttle = 0.05
            player.brake = 0.0
        _steer_toward_lane(player, mission.target_lane_index, dt)

        target_x = lane_center(mission.target_lane_index)
        if abs(player.position_x - target_x) < 0.3:
            mission.mode = CRUISE
            player.lane_index = mission.target_lane_index
            mission.lane_change_direction = 0.0

    elif mission.mode == OVERTAKE:
        target_mps = (mission.cruise_target_speed_mph + 10.0) * MPH_TO_MPS
        speed_error = target_mps - player.speed_mps
        if speed_error > 0.5:
            player.throttle = min(speed_error * 0.4, 1.0)
            player.brake = 0.0
        else:
            player.throttle = 0.1
            player.brake = 0.0
        _steer_toward_lane(player, mission.target_lane_index, dt)

        target_x = lane_center(mission.target_lane_index)
        if abs(player.position_x - target_x) < 0.3:
            if mission.return_lane_index is not None:
                mission.target_lane_index = mission.return_lane_index
                mission.return_lane_index = None
                mission.mode = LANE_CHANGE
            else:
                mission.mode = CRUISE


# ---------------------------------------------------------------------------
# Gymnasium Environment
# ---------------------------------------------------------------------------

class HighwayEnv(gym.Env):
    """Highway driving environment matching the Rust RLEnvironment.

    Observation: 12-dim continuous vector (see observation.py)
    Action: 3-dim continuous [throttle, brake, lane_request]
      - throttle in [0, 1]
      - brake in [0, 1]
      - lane_request in [-1, 1] (< -0.5 = left, > 0.5 = right)
    """

    metadata = {"render_modes": ["human"], "render_fps": 60}

    def __init__(
        self,
        max_episode_steps: int = 3600,
        cruise_target_mph: float = 65.0,
        initial_speed_mps: float = 29.0,
        seed: int | None = None,
    ) -> None:
        super().__init__()

        self.max_episode_steps = max_episode_steps
        self.cruise_target_mph = cruise_target_mph
        self.initial_speed_mps = initial_speed_mps

        self.observation_space = spaces.Box(
            low=-1.0,
            high=1.0,
            shape=(OBSERVATION_DIM,),
            dtype=np.float32,
        )
        self.action_space = spaces.Box(
            low=np.array([0.0, 0.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )

        self._rng = np.random.default_rng(seed)
        self._player: Vehicle | None = None
        self._npcs: list[Vehicle] = []
        self._mission: MissionState | None = None
        self._traffic: TrafficManager | None = None
        self._episode_length: int = 0
        self._total_distance: float = 0.0
        self._prev_z: float = 0.0
        self._prev_steer: float = 0.0
        self._collision: bool = False

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        if seed is not None:
            self._rng = np.random.default_rng(seed)

        self._player = Vehicle(
            id="player",
            lane_index=2,
            speed_mps=self.initial_speed_mps,
        )

        self._mission = MissionState(
            mode=CRUISE,
            target_lane_index=2,
            cruise_target_speed_mph=self.cruise_target_mph,
        )

        self._npcs = []
        self._traffic = TrafficManager(self._rng)
        self._traffic.spawn_initial(self._npcs)

        self._episode_length = 0
        self._total_distance = 0.0
        self._prev_z = self._player.position_z
        self._prev_steer = self._player.steer_angle_deg
        self._collision = False

        obs = self._build_observation()
        return obs, {}

    def step(
        self, action: np.ndarray
    ) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        assert self._player is not None
        assert self._mission is not None
        assert self._traffic is not None

        self._prev_z = self._player.position_z
        self._prev_steer = self._player.steer_angle_deg

        self._player.throttle = float(np.clip(action[0], 0.0, 1.0))
        self._player.brake = float(np.clip(action[1], 0.0, 1.0))

        lane_request = float(action[2])
        if lane_request < -0.5:
            current_lane = self._player.lane_index
            if current_lane > 0:
                self._mission.mode = LANE_CHANGE
                self._mission.target_lane_index = current_lane - 1
                self._mission.lane_change_direction = -1.0
        elif lane_request > 0.5:
            current_lane = self._player.lane_index
            if current_lane < NUM_LANES - 1:
                self._mission.mode = LANE_CHANGE
                self._mission.target_lane_index = current_lane + 1
                self._mission.lane_change_direction = 1.0

        apply_mission_control(self._player, self._mission, PHYSICS_DT)
        self._player.step(PHYSICS_DT)

        for npc in self._npcs:
            npc.step(PHYSICS_DT)

        self._collision = check_player_collisions(self._player, self._npcs)

        self._traffic.tick(self._player.position_z, self._npcs)
        self._episode_length += 1
        self._total_distance += self._player.position_z - self._prev_z

        reward_components = compute_reward(
            position_z=self._player.position_z,
            prev_z=self._prev_z,
            lateral_offset=self._player.lateral_offset,
            steer_angle_deg=self._player.steer_angle_deg,
            prev_steer_deg=self._prev_steer,
            speed_mps=self._player.speed_mps,
            cruise_target_mph=self._mission.cruise_target_speed_mph,
            collision=self._collision,
        )

        done = self._collision
        truncated = self._episode_length >= self.max_episode_steps

        info: dict[str, Any] = {
            "collision": self._collision,
            "speed_mph": self._player.speed_mph(),
            "distance_traveled": self._total_distance,
            "episode_length": self._episode_length,
            "reward_components": {
                "progress": reward_components.progress,
                "lane_keeping": reward_components.lane_keeping,
                "comfort": reward_components.comfort,
                "collision_penalty": reward_components.collision_penalty,
                "speed_match": reward_components.speed_match,
            },
        }

        obs = self._build_observation()
        return obs, reward_components.total, done, truncated, info

    def _build_observation(self) -> np.ndarray:
        assert self._player is not None
        assert self._mission is not None

        lane = self._player.lane_index
        gap_ahead, rel_speed_ahead = gap_to_vehicle_ahead(
            self._player, lane, self._npcs
        )
        gap_behind, rel_speed_behind = gap_to_vehicle_behind(
            self._player, lane, self._npcs
        )
        cross_lane_gap = float("inf")
        if lane > 0:
            cross_lane_gap, _ = gap_to_vehicle_ahead(
                self._player, lane - 1, self._npcs
            )

        return build_observation(
            lane_index=self._player.lane_index,
            lateral_offset=self._player.lateral_offset,
            speed_mps=self._player.speed_mps,
            cruise_target_mph=self._mission.cruise_target_speed_mph,
            gap_ahead=gap_ahead,
            gap_behind=gap_behind,
            rel_speed_ahead=rel_speed_ahead,
            rel_speed_behind=rel_speed_behind,
            mission_mode=self._mission.mode,
            target_lane=self._mission.target_lane_index,
            lane_change_dir=self._mission.lane_change_direction,
            cross_lane_gap=cross_lane_gap,
        )
