use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MissionMode {
    Hold,
    Cruise,
    LaneChange,
    Overtake,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaneChangeDirection {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MissionSource {
    Voice,
    Autopilot,
    Manual,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionState {
    pub mode: MissionMode,
    pub target_lane_index: usize,
    pub cruise_target_speed_mph: f64,
    pub cruise_gap_meters: f64,
    pub return_lane_index: Option<usize>,
    pub lane_change_direction: Option<LaneChangeDirection>,
    pub source: MissionSource,
    pub updated_at: u64,
}

impl Default for MissionState {
    fn default() -> Self {
        Self {
            mode: MissionMode::Hold,
            target_lane_index: 2,
            cruise_target_speed_mph: 65.0,
            cruise_gap_meters: 32.0,
            return_lane_index: None,
            lane_change_direction: None,
            source: MissionSource::System,
            updated_at: now_ms(),
        }
    }
}

impl MissionState {
    pub fn set_cruise(&mut self, speed_mph: f64, source: MissionSource) {
        self.mode = MissionMode::Cruise;
        self.cruise_target_speed_mph = speed_mph.clamp(0.0, crate::config::MAX_SPEED_MPH);
        self.source = source;
        self.updated_at = now_ms();
    }

    pub fn set_lane_change(
        &mut self,
        direction: LaneChangeDirection,
        current_lane: usize,
        source: MissionSource,
    ) {
        let target = match direction {
            LaneChangeDirection::Left => {
                if current_lane > 0 {
                    current_lane - 1
                } else {
                    return;
                }
            }
            LaneChangeDirection::Right => {
                if current_lane < crate::config::NUM_LANES - 1 {
                    current_lane + 1
                } else {
                    return;
                }
            }
        };

        self.mode = MissionMode::LaneChange;
        self.target_lane_index = target;
        self.lane_change_direction = Some(direction);
        self.source = source;
        self.updated_at = now_ms();
    }

    pub fn set_overtake(&mut self, current_lane: usize, source: MissionSource) {
        if current_lane == 0 {
            return;
        }
        self.mode = MissionMode::Overtake;
        self.return_lane_index = Some(current_lane);
        self.target_lane_index = current_lane - 1;
        self.lane_change_direction = Some(LaneChangeDirection::Left);
        self.source = source;
        self.updated_at = now_ms();
    }

    pub fn set_hold(&mut self, source: MissionSource) {
        self.mode = MissionMode::Hold;
        self.source = source;
        self.updated_at = now_ms();
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
