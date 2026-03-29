use std::time::Instant;

use crate::config::*;
use crate::mission::state::MissionState;
use crate::physics::spatial::check_player_collisions_spatial;
use crate::physics::vehicle::{Vehicle, VehicleType};
use crate::route::geometry::RoadSpline;

/// Duration in seconds after the last manual input before mission control resumes.
const MANUAL_OVERRIDE_TIMEOUT_S: f64 = 0.5;

pub struct World {
    pub player: Vehicle,
    pub npcs: Vec<Vehicle>,
    pub mission: MissionState,
    pub collision: bool,
    pub tick: u64,
    pub time_s: f64,
    pub road_spline: Option<RoadSpline>,
    /// When set, indicates the simulation time at which the last manual player input
    /// was received. Mission control will not override throttle/brake/steering while
    /// the player is actively sending input.
    pub manual_input_last_time: Option<f64>,
}

impl World {
    pub fn new() -> Self {
        let player = Vehicle::new("player".to_string(), VehicleType::Sedan, 2);
        Self {
            player,
            npcs: Vec::new(),
            mission: MissionState::default(),
            collision: false,
            tick: 0,
            time_s: 0.0,
            road_spline: None,
            manual_input_last_time: None,
        }
    }

    /// Returns true if the player is actively driving via keyboard/gamepad input,
    /// meaning mission control should not override throttle/brake/steering.
    pub fn is_manual_override_active(&self) -> bool {
        match self.manual_input_last_time {
            Some(t) => (self.time_s - t) < MANUAL_OVERRIDE_TIMEOUT_S,
            None => false,
        }
    }

    /// Called when a player_input WebSocket message is received.
    /// Stores the raw normalized steering input (-1..1) on the vehicle so the
    /// lane-keeping controller can distinguish manual steering from idle.
    /// The actual steer_angle_deg is now computed by the lane-keep PD controller
    /// each tick, blending manual intent with automatic centering.
    pub fn set_manual_input(&mut self, steering: f64, throttle: f64, brake: f64) {
        self.player.raw_steer_input = steering.clamp(-1.0, 1.0);
        self.player.steer_angle_deg = (steering * MAX_STEER_DEG).clamp(-MAX_STEER_DEG, MAX_STEER_DEG);
        self.player.throttle = throttle.clamp(0.0, 1.0);
        self.player.brake = brake.clamp(0.0, 1.0);
        self.manual_input_last_time = Some(self.time_s);
    }

    #[allow(dead_code)]
    pub fn set_road_spline(&mut self, spline: RoadSpline) {
        self.road_spline = Some(spline);
    }

    #[allow(dead_code)]
    pub fn clear_road_spline(&mut self) {
        self.road_spline = None;
    }

    pub fn step(&mut self) {
        let dt = PHYSICS_DT;

        if !self.is_manual_override_active() {
            self.player.raw_steer_input = 0.0;
        }

        self.apply_mission_control(dt);

        if let Some(road) = self.road_spline.take() {
            self.player.step_on_road(&road, dt);
            for npc in &mut self.npcs {
                npc.step_on_road(&road, dt);
            }
            self.road_spline = Some(road);
        } else {
            self.player.step(dt);
            for npc in &mut self.npcs {
                npc.step(dt);
            }
        }

        self.collision = check_player_collisions_spatial(&self.player, &self.npcs);

        self.tick += 1;
        self.time_s += dt;
    }

    fn apply_mission_control(&mut self, _dt: f64) {
        if self.is_manual_override_active() {
            return;
        }

        match self.mission.mode {
            crate::mission::state::MissionMode::Hold => {
                self.player.throttle = 0.0;
                if self.player.speed_mps > 0.0 {
                    self.player.brake = 0.3;
                } else {
                    self.player.brake = 0.0;
                }
                self.player.steering_target_lane = None;
            }
            crate::mission::state::MissionMode::Cruise => {
                let target_mps = self.mission.cruise_target_speed_mph * MPH_TO_MPS;
                let speed_error = target_mps - self.player.speed_mps;

                if speed_error > 1.0 {
                    self.player.throttle = (speed_error * 0.3).min(1.0);
                    self.player.brake = 0.0;
                } else if speed_error < -1.0 {
                    self.player.throttle = 0.0;
                    self.player.brake = (speed_error.abs() * 0.2).min(1.0);
                } else {
                    self.player.throttle = 0.05;
                    self.player.brake = 0.0;
                }

                self.player.steering_target_lane = Some(self.mission.target_lane_index);
            }
            crate::mission::state::MissionMode::LaneChange => {
                let target_mps = self.mission.cruise_target_speed_mph * MPH_TO_MPS;
                let speed_error = target_mps - self.player.speed_mps;
                if speed_error > 0.5 {
                    self.player.throttle = (speed_error * 0.3).min(1.0);
                    self.player.brake = 0.0;
                } else if speed_error < -0.5 {
                    self.player.throttle = 0.0;
                    self.player.brake = (speed_error.abs() * 0.2).min(1.0);
                } else {
                    self.player.throttle = 0.05;
                    self.player.brake = 0.0;
                }

                self.player.steering_target_lane = Some(self.mission.target_lane_index);

                let target_x =
                    crate::physics::vehicle::lane_center(self.mission.target_lane_index);
                if (self.player.position_x - target_x).abs() < 0.3 {
                    self.mission.mode = crate::mission::state::MissionMode::Cruise;
                    self.player.lane_index = self.mission.target_lane_index;
                    self.mission.lane_change_direction = None;
                }
            }
            crate::mission::state::MissionMode::Overtake => {
                let target_mps = (self.mission.cruise_target_speed_mph + 10.0) * MPH_TO_MPS;
                let speed_error = target_mps - self.player.speed_mps;
                if speed_error > 0.5 {
                    self.player.throttle = (speed_error * 0.4).min(1.0);
                    self.player.brake = 0.0;
                } else {
                    self.player.throttle = 0.1;
                    self.player.brake = 0.0;
                }

                self.player.steering_target_lane = Some(self.mission.target_lane_index);

                let target_x =
                    crate::physics::vehicle::lane_center(self.mission.target_lane_index);
                if (self.player.position_x - target_x).abs() < 0.3 {
                    if let Some(return_lane) = self.mission.return_lane_index {
                        self.mission.target_lane_index = return_lane;
                        self.mission.return_lane_index = None;
                        self.mission.mode = crate::mission::state::MissionMode::LaneChange;
                    } else {
                        self.mission.mode = crate::mission::state::MissionMode::Cruise;
                    }
                }
            }
        }
    }

    pub fn timestamp_ms(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}
