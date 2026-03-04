use serde::{Deserialize, Serialize};

use crate::mission::state::MissionSource;
use crate::physics::world::World;
use crate::rl::observation::RLObservation;
use crate::rl::reward::compute_reward;
use crate::traffic::manager::TrafficManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RLAction {
    pub throttle: f64,
    pub brake: f64,
    pub lane_request: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub observation: RLObservation,
    pub reward: f64,
    pub done: bool,
    pub truncated: bool,
    pub info: StepInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepInfo {
    pub collision: bool,
    pub speed_mph: f64,
    pub distance_traveled: f64,
    pub episode_length: u64,
}

pub struct RLEnvironment {
    pub world: World,
    pub traffic_manager: TrafficManager,
    pub episode_length: u64,
    pub max_episode_steps: u64,
    pub total_distance: f64,
    prev_z: f64,
    prev_steer: f64,
}

impl RLEnvironment {
    pub fn new() -> Self {
        let world = World::new();
        let traffic_manager = TrafficManager::new();
        let mut env = Self {
            world,
            traffic_manager,
            episode_length: 0,
            max_episode_steps: 3600,
            total_distance: 0.0,
            prev_z: 0.0,
            prev_steer: 0.0,
        };
        env.traffic_manager.spawn_initial(&mut env.world.npcs);
        env
    }

    pub fn reset(&mut self) -> RLObservation {
        self.world = World::new();
        self.world.mission.set_cruise(65.0, MissionSource::System);
        self.traffic_manager.reset(&mut self.world.npcs);
        self.episode_length = 0;
        self.total_distance = 0.0;
        self.prev_z = self.world.player.position_z;
        self.prev_steer = self.world.player.steer_angle_deg;
        RLObservation::from_world(&self.world)
    }

    pub fn step(&mut self, action: &RLAction) -> StepResult {
        self.prev_z = self.world.player.position_z;
        self.prev_steer = self.world.player.steer_angle_deg;

        self.world.player.throttle = action.throttle.clamp(0.0, 1.0);
        self.world.player.brake = action.brake.clamp(0.0, 1.0);

        if action.lane_request < -0.5 {
            let lane = self.world.player.lane_index;
            self.world.mission.set_lane_change(
                crate::mission::state::LaneChangeDirection::Left,
                lane,
                MissionSource::Autopilot,
            );
        } else if action.lane_request > 0.5 {
            let lane = self.world.player.lane_index;
            self.world.mission.set_lane_change(
                crate::mission::state::LaneChangeDirection::Right,
                lane,
                MissionSource::Autopilot,
            );
        }

        self.world.step();
        self.traffic_manager
            .tick(self.world.player.position_z, &mut self.world.npcs);

        self.episode_length += 1;
        self.total_distance += self.world.player.position_z - self.prev_z;

        let reward_components = compute_reward(&self.world, self.prev_z, self.prev_steer);

        let done = self.world.collision;
        let truncated = self.episode_length >= self.max_episode_steps;

        StepResult {
            observation: RLObservation::from_world(&self.world),
            reward: reward_components.total,
            done,
            truncated,
            info: StepInfo {
                collision: self.world.collision,
                speed_mph: self.world.player.speed_mph(),
                distance_traveled: self.total_distance,
                episode_length: self.episode_length,
            },
        }
    }
}
