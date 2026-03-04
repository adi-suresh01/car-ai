use serde::{Deserialize, Serialize};

use crate::traffic::policies::PolicyDistribution;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioConfig {
    pub name: String,
    pub description: String,
    pub road: RoadConfig,
    pub player: PlayerConfig,
    pub traffic: TrafficConfig,
    pub episode: EpisodeConfig,
    #[serde(default)]
    pub environment: EnvironmentConfig,
    #[serde(default)]
    pub mission: MissionObjectives,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadConfig {
    pub num_lanes: usize,
    pub lane_width_meters: f64,
    pub lane_speed_limits_mph: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerConfig {
    pub initial_lane: usize,
    pub initial_speed_mps: f64,
    pub cruise_target_mph: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficConfig {
    pub target_npc_count: usize,
    pub spawn_distance: f64,
    pub despawn_distance: f64,
    pub policy_distribution: PolicyDistribution,
    pub initial_spacing_meters: f64,
    pub initial_z_offset: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeConfig {
    pub max_steps: u64,
    pub collision_terminates: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentConfig {
    #[serde(default = "default_time_of_day")]
    pub time_of_day: String,
    #[serde(default = "default_weather")]
    pub weather: String,
    #[serde(default = "default_visibility")]
    pub visibility: f64,
}

impl Default for EnvironmentConfig {
    fn default() -> Self {
        Self {
            time_of_day: default_time_of_day(),
            weather: default_weather(),
            visibility: default_visibility(),
        }
    }
}

fn default_time_of_day() -> String {
    "day".to_string()
}

fn default_weather() -> String {
    "clear".to_string()
}

fn default_visibility() -> f64 {
    1.0
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MissionObjectives {
    #[serde(default)]
    pub target_distance_m: Option<f64>,
    #[serde(default)]
    pub target_avg_speed_mph: Option<f64>,
    #[serde(default)]
    pub max_collisions: Option<u32>,
    #[serde(default)]
    pub required_lane_changes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioSummary {
    pub name: String,
    pub description: String,
    pub npc_count: usize,
    pub num_lanes: usize,
    pub environment: EnvironmentConfig,
}

impl From<&ScenarioConfig> for ScenarioSummary {
    fn from(cfg: &ScenarioConfig) -> Self {
        Self {
            name: cfg.name.clone(),
            description: cfg.description.clone(),
            npc_count: cfg.traffic.target_npc_count,
            num_lanes: cfg.road.num_lanes,
            environment: cfg.environment.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_default_scenario() {
        let json = include_str!("../../../data/scenarios/default.json");
        let config: ScenarioConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.name, "highway_default");
        assert_eq!(config.road.num_lanes, 5);
        assert_eq!(config.player.initial_lane, 2);
        assert_eq!(config.traffic.target_npc_count, 12);
    }

    #[test]
    fn environment_defaults_apply() {
        let env = EnvironmentConfig::default();
        assert_eq!(env.time_of_day, "day");
        assert_eq!(env.weather, "clear");
        assert!((env.visibility - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn scenario_summary_captures_key_fields() {
        let json = include_str!("../../../data/scenarios/default.json");
        let config: ScenarioConfig = serde_json::from_str(json).unwrap();
        let summary = ScenarioSummary::from(&config);
        assert_eq!(summary.name, "highway_default");
        assert_eq!(summary.npc_count, 12);
    }
}
