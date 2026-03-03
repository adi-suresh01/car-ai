use crate::config::*;
use crate::mission::state::MissionState;
use crate::physics::spatial::check_player_collisions_spatial;
use crate::physics::vehicle::{Vehicle, VehicleType};
use crate::route::geometry::RoadSpline;

pub struct World {
    pub player: Vehicle,
    pub npcs: Vec<Vehicle>,
    pub mission: MissionState,
    pub collision: bool,
    pub tick: u64,
    pub time_s: f64,
    pub road_spline: Option<RoadSpline>,
}

impl World {
    pub fn new() -> Self {
        let mut player = Vehicle::new("player".to_string(), VehicleType::Sedan, 2);
        player.speed_mps = 29.0;
        Self {
            player,
            npcs: Vec::new(),
            mission: MissionState::default(),
            collision: false,
            tick: 0,
            time_s: 0.0,
            road_spline: None,
        }
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

    fn apply_mission_control(&mut self, dt: f64) {
        match self.mission.mode {
            crate::mission::state::MissionMode::Hold => {
                self.player.throttle = 0.0;
                if self.player.speed_mps > 0.0 {
                    self.player.brake = 0.3;
                } else {
                    self.player.brake = 0.0;
                }
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

                self.steer_toward_lane(self.mission.target_lane_index, dt);
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

                self.steer_toward_lane(self.mission.target_lane_index, dt);

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

                self.steer_toward_lane(self.mission.target_lane_index, dt);

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

    fn steer_toward_lane(&mut self, target_lane: usize, dt: f64) {
        let target_x = crate::physics::vehicle::lane_center(target_lane);
        let lateral_error = target_x - self.player.position_x;

        let desired_steer = (lateral_error * 8.0).clamp(-MAX_STEER_DEG, MAX_STEER_DEG);

        let steer_delta = desired_steer - self.player.steer_angle_deg;
        let max_delta = STEER_RATE_DEG_PER_S * dt;
        self.player.steer_angle_deg += steer_delta.clamp(-max_delta, max_delta);
    }

    pub fn timestamp_ms(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}
