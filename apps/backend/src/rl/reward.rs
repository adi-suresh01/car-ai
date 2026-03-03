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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mission::state::MissionSource;
    use crate::physics::world::World;

    fn world_at_speed_and_mission(speed_mps: f64, target_mph: f64) -> World {
        let mut world = World::new();
        world.player.speed_mps = speed_mps;
        world.player.position_z = 0.0;
        world.mission.set_cruise(target_mph, MissionSource::System);
        world.collision = false;
        world
    }

    #[test]
    fn progress_reward_positive_when_moving_forward() {
        let world = world_at_speed_and_mission(30.0, 65.0);
        let prev_z = -10.0;
        let components = compute_reward(&world, prev_z, 0.0);
        assert!(
            components.progress > 0.0,
            "forward progress should yield positive reward"
        );
    }

    #[test]
    fn collision_penalty_applied_when_colliding() {
        let mut world = world_at_speed_and_mission(20.0, 65.0);
        world.collision = true;
        let components = compute_reward(&world, world.player.position_z, 0.0);
        assert!(
            components.collision_penalty < 0.0,
            "collision should incur negative penalty"
        );
    }

    #[test]
    fn no_collision_penalty_without_collision() {
        let world = world_at_speed_and_mission(20.0, 65.0);
        let components = compute_reward(&world, world.player.position_z, 0.0);
        assert_eq!(
            components.collision_penalty, 0.0,
            "no collision means zero penalty"
        );
    }

    #[test]
    fn lane_keeping_high_when_centered() {
        let world = world_at_speed_and_mission(20.0, 65.0);
        // Player spawned centered in lane; lateral_offset should be 0.0
        let components = compute_reward(&world, world.player.position_z, 0.0);
        assert!(
            components.lane_keeping > 0.9,
            "centered vehicle should have high lane keeping reward"
        );
    }

    #[test]
    fn speed_match_reward_high_when_at_target() {
        let target_mph = 65.0;
        let target_mps = target_mph * MPH_TO_MPS;
        let world = world_at_speed_and_mission(target_mps, target_mph);
        let components = compute_reward(&world, world.player.position_z, 0.0);
        assert!(
            components.speed_match > 0.9,
            "vehicle at target speed should have high speed match reward"
        );
    }

    #[test]
    fn total_reward_is_sum_of_components() {
        let world = world_at_speed_and_mission(30.0, 65.0);
        let prev_z = world.player.position_z - 1.0;
        let components = compute_reward(&world, prev_z, 0.0);
        let expected_total = components.progress * 1.0
            + components.lane_keeping * 0.3
            + components.comfort * 0.1
            + components.collision_penalty
            + components.speed_match * 0.5;
        let diff = (components.total - expected_total).abs();
        assert!(diff < 1e-9, "total should equal weighted sum of components");
    }
}
