use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::mission::state::MissionSource;
use crate::physics::vehicle::{lane_center, Vehicle, VehicleType};
use crate::physics::world::World;
use crate::scenario::config::{ScenarioConfig, ScenarioSummary};
use crate::traffic::manager::TrafficManager;

pub struct ScenarioLoader {
    scenarios: HashMap<String, ScenarioConfig>,
    scenarios_dir: PathBuf,
    active_scenario: Option<String>,
}

impl ScenarioLoader {
    pub fn new(scenarios_dir: &Path) -> Self {
        let mut loader = Self {
            scenarios: HashMap::new(),
            scenarios_dir: scenarios_dir.to_path_buf(),
            active_scenario: None,
        };
        loader.scan_directory();
        loader
    }

    pub fn scan_directory(&mut self) {
        self.scenarios.clear();

        let dir = match std::fs::read_dir(&self.scenarios_dir) {
            Ok(d) => d,
            Err(e) => {
                log::warn!(
                    "Failed to read scenarios directory {:?}: {}",
                    self.scenarios_dir,
                    e
                );
                return;
            }
        };

        for entry in dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                match std::fs::read_to_string(&path) {
                    Ok(content) => match serde_json::from_str::<ScenarioConfig>(&content) {
                        Ok(config) => {
                            log::info!("Loaded scenario: {} from {:?}", config.name, path);
                            self.scenarios.insert(config.name.clone(), config);
                        }
                        Err(e) => {
                            log::warn!("Failed to parse scenario {:?}: {}", path, e);
                        }
                    },
                    Err(e) => {
                        log::warn!("Failed to read scenario file {:?}: {}", path, e);
                    }
                }
            }
        }
    }

    pub fn list_scenarios(&self) -> Vec<ScenarioSummary> {
        self.scenarios
            .values()
            .map(ScenarioSummary::from)
            .collect()
    }

    #[allow(dead_code)]
    pub fn get_scenario(&self, name: &str) -> Option<&ScenarioConfig> {
        self.scenarios.get(name)
    }

    #[allow(dead_code)]
    pub fn active_scenario_name(&self) -> Option<&str> {
        self.active_scenario.as_deref()
    }

    pub fn apply_scenario(
        &mut self,
        name: &str,
        world: &mut World,
        traffic_manager: &mut TrafficManager,
    ) -> Result<ScenarioSummary, String> {
        let config = self
            .scenarios
            .get(name)
            .ok_or_else(|| format!("Scenario '{}' not found", name))?
            .clone();

        world.player = Vehicle::new(
            "player".to_string(),
            VehicleType::Sedan,
            config.player.initial_lane,
        );
        world.player.speed_mps = config.player.initial_speed_mps;
        world.player.position_x = lane_center(config.player.initial_lane);
        world.player.position_z = 0.0;

        world.mission.set_cruise(config.player.cruise_target_mph, MissionSource::System);
        world.collision = false;
        world.tick = 0;
        world.time_s = 0.0;

        traffic_manager.set_target_count(config.traffic.target_npc_count);
        traffic_manager.set_policy_distribution(config.traffic.policy_distribution.clone());
        traffic_manager.reset(&mut world.npcs);

        self.active_scenario = Some(name.to_string());

        Ok(ScenarioSummary::from(&config))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scenarios_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("data")
            .join("scenarios")
    }

    #[test]
    fn loader_finds_default_scenario() {
        let loader = ScenarioLoader::new(&scenarios_dir());
        assert!(
            loader.get_scenario("highway_default").is_some(),
            "should find highway_default scenario"
        );
    }

    #[test]
    fn list_scenarios_includes_default() {
        let loader = ScenarioLoader::new(&scenarios_dir());
        let list = loader.list_scenarios();
        assert!(
            list.iter().any(|s| s.name == "highway_default"),
            "scenario list should include highway_default"
        );
    }

    #[test]
    fn apply_scenario_resets_world() {
        let mut loader = ScenarioLoader::new(&scenarios_dir());
        let mut world = World::new();
        let mut traffic = TrafficManager::new();
        traffic.spawn_initial(&mut world.npcs);

        world.player.position_z = 5000.0;
        world.tick = 999;

        let result = loader.apply_scenario("highway_default", &mut world, &mut traffic);
        assert!(result.is_ok());
        assert_eq!(world.player.position_z, 0.0);
        assert_eq!(world.tick, 0);
        assert_eq!(
            loader.active_scenario_name(),
            Some("highway_default")
        );
    }

    #[test]
    fn apply_nonexistent_scenario_returns_error() {
        let mut loader = ScenarioLoader::new(&scenarios_dir());
        let mut world = World::new();
        let mut traffic = TrafficManager::new();
        let result = loader.apply_scenario("does_not_exist", &mut world, &mut traffic);
        assert!(result.is_err());
    }
}
