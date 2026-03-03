use serde::{Deserialize, Serialize};

use crate::mission::state::{LaneChangeDirection, MissionMode, MissionState};
use crate::physics::vehicle::Vehicle;
use crate::physics::world::World;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
    pub lane_index: usize,
    pub lateral_offset: f64,
    pub speed_mph: f64,
    pub speed_mps: f64,
    pub steer_angle_deg: f64,
    pub heading_rad: f64,
    pub position_z: f64,
    pub gear: u8,
}

impl From<&Vehicle> for PlayerSnapshot {
    fn from(v: &Vehicle) -> Self {
        Self {
            lane_index: v.lane_index,
            lateral_offset: v.lateral_offset,
            speed_mph: v.speed_mph(),
            speed_mps: v.speed_mps,
            steer_angle_deg: v.steer_angle_deg,
            heading_rad: v.heading_rad,
            position_z: v.position_z,
            gear: v.gear(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleSnapshot {
    pub id: String,
    #[serde(rename = "type")]
    pub vehicle_type: String,
    pub lane_index: usize,
    pub speed_mph: f64,
    pub speed_mps: f64,
    pub position: [f64; 3],
    pub heading: [f64; 3],
}

impl From<&Vehicle> for VehicleSnapshot {
    fn from(v: &Vehicle) -> Self {
        Self {
            id: v.id.clone(),
            vehicle_type: v.vehicle_type.as_str().to_string(),
            lane_index: v.lane_index,
            speed_mph: v.speed_mph(),
            speed_mps: v.speed_mps,
            position: [v.position_x, 0.0, v.position_z],
            heading: [v.heading_rad.sin(), 0.0, v.heading_rad.cos()],
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSnapshot {
    pub timestamp: u64,
    pub player: PlayerSnapshot,
    pub vehicles: Vec<VehicleSnapshot>,
    pub mission: MissionState,
    pub collision: bool,
}

impl SimulationSnapshot {
    pub fn from_world(world: &World) -> Self {
        Self {
            timestamp: world.timestamp_ms(),
            player: PlayerSnapshot::from(&world.player),
            vehicles: world.npcs.iter().map(VehicleSnapshot::from).collect(),
            mission: world.mission.clone(),
            collision: world.collision,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneDefinition {
    pub index: usize,
    #[serde(rename = "type")]
    pub lane_type: String,
    pub speed_limit_mph: f64,
    pub description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationLayout {
    pub lanes: Vec<LaneDefinition>,
    pub scene_name: String,
    pub lane_centers: Vec<f64>,
}

impl SimulationLayout {
    pub fn default_highway() -> Self {
        let lanes = vec![
            LaneDefinition {
                index: 0,
                lane_type: "travel".to_string(),
                speed_limit_mph: 75.0,
                description: "Fast lane (leftmost)".to_string(),
            },
            LaneDefinition {
                index: 1,
                lane_type: "travel".to_string(),
                speed_limit_mph: 70.0,
                description: "Left-center lane".to_string(),
            },
            LaneDefinition {
                index: 2,
                lane_type: "travel".to_string(),
                speed_limit_mph: 65.0,
                description: "Center lane".to_string(),
            },
            LaneDefinition {
                index: 3,
                lane_type: "travel".to_string(),
                speed_limit_mph: 60.0,
                description: "Right-center lane".to_string(),
            },
            LaneDefinition {
                index: 4,
                lane_type: "shoulder".to_string(),
                speed_limit_mph: 55.0,
                description: "Slow lane / shoulder".to_string(),
            },
        ];

        let lane_centers: Vec<f64> = (0..crate::config::NUM_LANES)
            .map(crate::physics::vehicle::lane_center)
            .collect();

        Self {
            lanes,
            scene_name: "highway".to_string(),
            lane_centers,
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionUpdateRequest {
    pub mode: Option<MissionMode>,
    pub cruise_target_speed_mph: Option<f64>,
    pub lane_change_direction: Option<LaneChangeDirection>,
    pub target_lane_index: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct PlayerInput {
    pub steering: Option<f64>,
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsClientMessage {
    PlayerInput {
        steering: f64,
        throttle: f64,
        brake: f64,
    },
    VoiceCommand {
        utterance: String,
    },
}

#[allow(dead_code)]
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsServerMessage {
    State(Box<SimulationSnapshot>),
}
