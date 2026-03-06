use log::debug;

use crate::mission::state::{LaneChangeDirection, MissionMode, MissionSource};

#[derive(Debug, Clone)]
pub enum VoiceIntent {
    SetCruise { speed_mph: f64 },
    SpeedUp { delta_mph: f64 },
    SlowDown { delta_mph: f64 },
    LaneChange { direction: LaneChangeDirection },
    Overtake,
    Hold,
    Unknown(String),
}

pub fn parse_utterance(utterance: &str) -> VoiceIntent {
    let lower = utterance.to_lowercase();
    let tokens: Vec<&str> = lower.split_whitespace().collect();

    if let Some(speed) = extract_cruise_speed(&tokens) {
        return VoiceIntent::SetCruise { speed_mph: speed };
    }

    // "speed up", "go faster", "accelerate"
    if lower.contains("speed up") || lower.contains("faster") || lower.contains("accelerate") {
        let delta = extract_number(&tokens).unwrap_or(5.0);
        return VoiceIntent::SpeedUp { delta_mph: delta };
    }

    // "slow down", "decelerate", "slower"
    if lower.contains("slow down") || lower.contains("slower") || lower.contains("decelerate") {
        let delta = extract_number(&tokens).unwrap_or(5.0);
        return VoiceIntent::SlowDown { delta_mph: delta };
    }

    if lower.contains("lane left") || lower.contains("move left") || lower.contains("go left") {
        return VoiceIntent::LaneChange {
            direction: LaneChangeDirection::Left,
        };
    }

    if lower.contains("lane right")
        || lower.contains("move right")
        || lower.contains("go right")
    {
        return VoiceIntent::LaneChange {
            direction: LaneChangeDirection::Right,
        };
    }

    if lower.contains("overtake") || lower.contains("pass") {
        return VoiceIntent::Overtake;
    }

    if lower.contains("hold")
        || lower.contains("stop")
        || lower.contains("brake")
        || lower.contains("halt")
    {
        return VoiceIntent::Hold;
    }

    VoiceIntent::Unknown(utterance.to_string())
}

fn extract_number(tokens: &[&str]) -> Option<f64> {
    for token in tokens {
        if let Ok(n) = token.parse::<f64>() {
            if n > 0.0 && n <= 120.0 {
                return Some(n);
            }
        }
    }
    None
}

fn extract_cruise_speed(tokens: &[&str]) -> Option<f64> {
    let has_cruise = tokens
        .iter()
        .any(|t| *t == "cruise" || *t == "speed" || *t == "set");

    if !has_cruise {
        return None;
    }

    for token in tokens {
        if let Ok(speed) = token.parse::<f64>() {
            if (1.0..=120.0).contains(&speed) {
                return Some(speed);
            }
        }
    }

    None
}

pub fn intent_to_mission_update(intent: &VoiceIntent) -> Option<MissionUpdate> {
    match intent {
        VoiceIntent::SetCruise { speed_mph } => Some(MissionUpdate {
            mode: Some(MissionMode::Cruise),
            cruise_target_speed_mph: Some(*speed_mph),
            speed_delta_mph: None,
            lane_change_direction: None,
            source: MissionSource::Voice,
        }),
        VoiceIntent::SpeedUp { delta_mph } => Some(MissionUpdate {
            mode: Some(MissionMode::Cruise),
            cruise_target_speed_mph: None,
            speed_delta_mph: Some(*delta_mph),
            lane_change_direction: None,
            source: MissionSource::Voice,
        }),
        VoiceIntent::SlowDown { delta_mph } => Some(MissionUpdate {
            mode: Some(MissionMode::Cruise),
            cruise_target_speed_mph: None,
            speed_delta_mph: Some(-*delta_mph),
            lane_change_direction: None,
            source: MissionSource::Voice,
        }),
        VoiceIntent::LaneChange { direction } => Some(MissionUpdate {
            mode: Some(MissionMode::LaneChange),
            cruise_target_speed_mph: None,
            speed_delta_mph: None,
            lane_change_direction: Some(*direction),
            source: MissionSource::Voice,
        }),
        VoiceIntent::Overtake => Some(MissionUpdate {
            mode: Some(MissionMode::Overtake),
            cruise_target_speed_mph: None,
            speed_delta_mph: None,
            lane_change_direction: None,
            source: MissionSource::Voice,
        }),
        VoiceIntent::Hold => Some(MissionUpdate {
            mode: Some(MissionMode::Hold),
            cruise_target_speed_mph: None,
            speed_delta_mph: None,
            lane_change_direction: None,
            source: MissionSource::Voice,
        }),
        VoiceIntent::Unknown(ref utterance) => {
            debug!("Unrecognized voice intent: {:?}", utterance);
            None
        }
    }
}

#[derive(Debug, Clone)]
pub struct MissionUpdate {
    pub mode: Option<MissionMode>,
    pub cruise_target_speed_mph: Option<f64>,
    pub speed_delta_mph: Option<f64>,
    pub lane_change_direction: Option<LaneChangeDirection>,
    pub source: MissionSource,
}
