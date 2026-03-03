use crate::config::*;
use crate::physics::world::World;

pub struct RewardComponents {
    pub progress: f64,
    pub lane_keeping: f64,
    pub comfort: f64,
    pub collision_penalty: f64,
    pub speed_match: f64,
    pub total: f64,
}

pub fn compute_reward(world: &World, prev_z: f64, prev_steer: f64) -> RewardComponents {
    let player = &world.player;

    let progress = (player.position_z - prev_z) * 0.01;

    let lateral_error = player.lateral_offset.abs() / LANE_WIDTH_METERS;
    let lane_keeping = 1.0 - lateral_error.min(1.0);

    let steer_change = (player.steer_angle_deg - prev_steer).abs() / MAX_STEER_DEG;
    let comfort = 1.0 - steer_change.min(1.0);

    let collision_penalty = if world.collision { -10.0 } else { 0.0 };

    let target_mps = world.mission.cruise_target_speed_mph * MPH_TO_MPS;
    let speed_error = (player.speed_mps - target_mps).abs() / target_mps.max(1.0);
    let speed_match = 1.0 - speed_error.min(1.0);

    let total = progress * 1.0
        + lane_keeping * 0.3
        + comfort * 0.1
        + collision_penalty
        + speed_match * 0.5;

    RewardComponents {
        progress,
        lane_keeping,
        comfort,
        collision_penalty,
        speed_match,
        total,
    }
}
