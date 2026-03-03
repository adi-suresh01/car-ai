use serde::Serialize;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::mission::state::MissionMode;
use crate::physics::vehicle::Vehicle;
use crate::physics::world::World;

#[derive(Debug, Serialize)]
struct RecordedStep {
    tick: u64,
    time_s: f64,
    player_lane: usize,
    player_speed_mps: f64,
    player_position_x: f64,
    player_position_z: f64,
    player_heading_rad: f64,
    player_throttle: f64,
    player_brake: f64,
    player_steer_deg: f64,
    mission_mode: String,
    cruise_target_mph: f64,
    collision: bool,
    npc_count: usize,
    npcs: Vec<RecordedNpc>,
}

#[derive(Debug, Serialize)]
struct RecordedNpc {
    id: String,
    lane: usize,
    speed_mps: f64,
    x: f64,
    z: f64,
}

fn mission_mode_str(mode: MissionMode) -> &'static str {
    match mode {
        MissionMode::Hold => "hold",
        MissionMode::Cruise => "cruise",
        MissionMode::LaneChange => "lane_change",
        MissionMode::Overtake => "overtake",
    }
}

fn npc_snapshot(v: &Vehicle) -> RecordedNpc {
    RecordedNpc {
        id: v.id.clone(),
        lane: v.lane_index,
        speed_mps: v.speed_mps,
        x: v.position_x,
        z: v.position_z,
    }
}

pub struct EpisodeRecorder {
    writer: Option<BufWriter<File>>,
    file_path: Option<PathBuf>,
    step_count: u64,
    active: bool,
}

impl EpisodeRecorder {
    pub fn new() -> Self {
        Self {
            writer: None,
            file_path: None,
            step_count: 0,
            active: false,
        }
    }

    pub fn is_active(&self) -> bool {
        self.active
    }

    pub fn step_count(&self) -> u64 {
        self.step_count
    }

    pub fn file_path(&self) -> Option<&PathBuf> {
        self.file_path.as_ref()
    }

    pub fn start(&mut self, output_dir: &str) -> Result<String, String> {
        if self.active {
            return Err("Recording already in progress".to_string());
        }

        fs::create_dir_all(output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let filename = format!("episode_{}.jsonl", timestamp);
        let path = PathBuf::from(output_dir).join(&filename);

        let file =
            File::create(&path).map_err(|e| format!("Failed to create recording file: {}", e))?;

        self.writer = Some(BufWriter::new(file));
        self.file_path = Some(path);
        self.step_count = 0;
        self.active = true;

        Ok(filename)
    }

    pub fn record_step(&mut self, world: &World) {
        if !self.active {
            return;
        }

        let step = RecordedStep {
            tick: world.tick,
            time_s: world.time_s,
            player_lane: world.player.lane_index,
            player_speed_mps: world.player.speed_mps,
            player_position_x: world.player.position_x,
            player_position_z: world.player.position_z,
            player_heading_rad: world.player.heading_rad,
            player_throttle: world.player.throttle,
            player_brake: world.player.brake,
            player_steer_deg: world.player.steer_angle_deg,
            mission_mode: mission_mode_str(world.mission.mode).to_string(),
            cruise_target_mph: world.mission.cruise_target_speed_mph,
            collision: world.collision,
            npc_count: world.npcs.len(),
            npcs: world.npcs.iter().map(npc_snapshot).collect(),
        };

        if let Some(writer) = &mut self.writer {
            if let Ok(line) = serde_json::to_string(&step) {
                let _ = writeln!(writer, "{}", line);
            }
        }

        self.step_count += 1;
    }

    pub fn stop(&mut self) -> Result<RecordingSummary, String> {
        if !self.active {
            return Err("No recording in progress".to_string());
        }

        if let Some(writer) = &mut self.writer {
            let _ = writer.flush();
        }

        let summary = RecordingSummary {
            file_path: self
                .file_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
            total_steps: self.step_count,
        };

        self.writer = None;
        self.active = false;

        Ok(summary)
    }
}

#[derive(Debug, Serialize)]
pub struct RecordingSummary {
    pub file_path: String,
    pub total_steps: u64,
}

#[derive(Debug, Serialize)]
pub struct RecordingStatus {
    pub active: bool,
    pub step_count: u64,
    pub file_path: Option<String>,
}

impl From<&EpisodeRecorder> for RecordingStatus {
    fn from(recorder: &EpisodeRecorder) -> Self {
        Self {
            active: recorder.is_active(),
            step_count: recorder.step_count(),
            file_path: recorder.file_path().map(|p| p.to_string_lossy().to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn recorder_starts_and_stops() {
        let dir = std::env::temp_dir().join("voicedrive_test_recorder");
        let _ = fs::remove_dir_all(&dir);

        let mut recorder = EpisodeRecorder::new();
        assert!(!recorder.is_active());

        let filename = recorder.start(dir.to_str().unwrap()).unwrap();
        assert!(recorder.is_active());
        assert!(filename.starts_with("episode_"));
        assert!(filename.ends_with(".jsonl"));

        let world = World::new();
        recorder.record_step(&world);
        recorder.record_step(&world);
        assert_eq!(recorder.step_count(), 2);

        let summary = recorder.stop().unwrap();
        assert_eq!(summary.total_steps, 2);
        assert!(!recorder.is_active());

        let mut content = String::new();
        File::open(&summary.file_path)
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        let lines: Vec<&str> = content.trim().lines().collect();
        assert_eq!(lines.len(), 2);

        let parsed: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert!(parsed.get("tick").is_some());
        assert!(parsed.get("player_speed_mps").is_some());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn double_start_returns_error() {
        let dir = std::env::temp_dir().join("voicedrive_test_double_start");
        let _ = fs::remove_dir_all(&dir);

        let mut recorder = EpisodeRecorder::new();
        recorder.start(dir.to_str().unwrap()).unwrap();
        let result = recorder.start(dir.to_str().unwrap());
        assert!(result.is_err());

        recorder.stop().unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stop_without_start_returns_error() {
        let mut recorder = EpisodeRecorder::new();
        let result = recorder.stop();
        assert!(result.is_err());
    }
}
