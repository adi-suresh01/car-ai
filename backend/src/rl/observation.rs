use serde::{Deserialize, Serialize};

use crate::config::*;
use crate::mission::state::{LaneChangeDirection, MissionMode};
use crate::physics::collision::{gap_to_vehicle_ahead, gap_to_vehicle_behind};
use crate::physics::world::World;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RLObservation {
    pub lane_position: f64,
    pub lateral_offset: f64,
    pub speed: f64,
    pub target_speed: f64,
    pub gap_ahead: f64,
    pub gap_behind: f64,
    pub rel_speed_ahead: f64,
    pub rel_speed_behind: f64,
    pub mission_mode: f64,
    pub target_lane: f64,
    pub lane_change_dir: f64,
    pub cross_lane_gap: f64,
}

impl RLObservation {
    pub fn from_world(world: &World) -> Self {
        let player = &world.player;
        let lane = player.lane_index;

        let (gap_ahead, rel_speed_ahead) =
            gap_to_vehicle_ahead(player, lane, &world.npcs);
        let (gap_behind, rel_speed_behind) =
            gap_to_vehicle_behind(player, lane, &world.npcs);

        let cross_lane = if lane > 0 {
            let (g, _) = gap_to_vehicle_ahead(player, lane - 1, &world.npcs);
            g
        } else {
            f64::MAX
        };

        let mission_mode_f = match world.mission.mode {
            MissionMode::Hold => 0.0,
            MissionMode::Cruise => 1.0,
            MissionMode::LaneChange => 2.0,
            MissionMode::Overtake => 3.0,
        };

        let lane_change_dir_f = match world.mission.lane_change_direction {
            Some(LaneChangeDirection::Left) => -1.0,
            Some(LaneChangeDirection::Right) => 1.0,
            None => 0.0,
        };

        let max_gap = 200.0;

        RLObservation {
            lane_position: lane as f64 / (NUM_LANES as f64 - 1.0),
            lateral_offset: player.lateral_offset / LANE_WIDTH_METERS,
            speed: player.speed_mps / (MAX_SPEED_MPH * MPH_TO_MPS),
            target_speed: world.mission.cruise_target_speed_mph / MAX_SPEED_MPH,
            gap_ahead: (gap_ahead.min(max_gap)) / max_gap,
            gap_behind: (gap_behind.min(max_gap)) / max_gap,
            rel_speed_ahead: (rel_speed_ahead / 20.0).clamp(-1.0, 1.0),
            rel_speed_behind: (rel_speed_behind / 20.0).clamp(-1.0, 1.0),
            mission_mode: mission_mode_f / 3.0,
            target_lane: world.mission.target_lane_index as f64 / (NUM_LANES as f64 - 1.0),
            lane_change_dir: lane_change_dir_f,
            cross_lane_gap: (cross_lane.min(max_gap)) / max_gap,
        }
    }

    pub fn to_vec(&self) -> Vec<f64> {
        vec![
            self.lane_position,
            self.lateral_offset,
            self.speed,
            self.target_speed,
            self.gap_ahead,
            self.gap_behind,
            self.rel_speed_ahead,
            self.rel_speed_behind,
            self.mission_mode,
            self.target_lane,
            self.lane_change_dir,
            self.cross_lane_gap,
        ]
    }
}
