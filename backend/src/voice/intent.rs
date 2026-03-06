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
    Resume,
    MaintainSpeed,
    PullOver,
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

    if lower.contains("lane left") || lower.contains("left lane")
        || lower.contains("move left") || lower.contains("go left")
        || lower.contains("merge left") || lower.contains("switch left") || lower.contains("change left")
    {
        return VoiceIntent::LaneChange {
            direction: LaneChangeDirection::Left,
        };
    }

    if lower.contains("lane right") || lower.contains("right lane")
        || lower.contains("move right") || lower.contains("go right")
        || lower.contains("merge right") || lower.contains("switch right")
        || lower.contains("change right")
    {
        return VoiceIntent::LaneChange {
            direction: LaneChangeDirection::Right,
        };
    }

    if lower.contains("overtake") || lower.contains("pass them")
        || lower.contains("pass the") || lower.contains("pass this")
        || lower.contains("pass car") || lower.contains("pass truck")
        || (lower.contains("pass") && !lower.contains("passenger"))
    {
        return VoiceIntent::Overtake;
    }

    if lower.contains("hold")
        || lower.contains("stop")
        || lower.contains("brake")
        || lower.contains("halt")
        || lower.contains("cancel")
        || lower.contains("abort")
        || lower.contains("nevermind")
        || lower.contains("never mind")
    {
        return VoiceIntent::Hold;
    }

    if lower.contains("pull over")
        || lower.contains("pull off")
        || lower.contains("move to shoulder")
        || lower.contains("emergency stop")
    {
        return VoiceIntent::PullOver;
    }

    if lower.contains("maintain speed")
        || lower.contains("keep speed")
        || lower.contains("lock speed")
        || lower.contains("maintain current")
    {
        return VoiceIntent::MaintainSpeed;
    }

    if lower.contains("resume")
        || lower.contains("continue")
        || lower.contains("go ahead")
        || lower.contains("keep going")
    {
        return VoiceIntent::Resume;
    }

    VoiceIntent::Unknown(utterance.to_string())
}

fn word_to_number(word: &str) -> Option<f64> {
    match word {
        "zero" => Some(0.0),
        "one" => Some(1.0),
        "two" => Some(2.0),
        "three" => Some(3.0),
        "four" => Some(4.0),
        "five" => Some(5.0),
        "six" => Some(6.0),
        "seven" => Some(7.0),
        "eight" => Some(8.0),
        "nine" => Some(9.0),
        "ten" => Some(10.0),
        "fifteen" => Some(15.0),
        "twenty" => Some(20.0),
        "twenty-five" | "twentyfive" => Some(25.0),
        "thirty" => Some(30.0),
        "thirty-five" | "thirtyfive" => Some(35.0),
        "forty" => Some(40.0),
        "forty-five" | "fortyfive" => Some(45.0),
        "fifty" => Some(50.0),
        "fifty-five" | "fiftyfive" => Some(55.0),
        "sixty" => Some(60.0),
        "sixty-five" | "sixtyfive" => Some(65.0),
        "seventy" => Some(70.0),
        "seventy-five" | "seventyfive" => Some(75.0),
        "eighty" => Some(80.0),
        "eighty-five" | "eightyfive" => Some(85.0),
        "ninety" => Some(90.0),
        "ninety-five" | "ninetyfive" => Some(95.0),
        "hundred" => Some(100.0),
        _ => None,
    }
}

fn extract_number(tokens: &[&str]) -> Option<f64> {
    // Try numeric parsing first
    for token in tokens {
        if let Ok(n) = token.parse::<f64>() {
            if n > 0.0 && n <= 120.0 {
                return Some(n);
            }
        }
    }
    // Try compound word numbers: "sixty five" → 65
    for window in tokens.windows(2) {
        if let (Some(tens), Some(ones)) = (word_to_number(window[0]), word_to_number(window[1])) {
            if tens >= 20.0 && tens % 10.0 == 0.0 && ones >= 1.0 && ones <= 9.0 {
                let combined = tens + ones;
                if combined > 0.0 && combined <= 120.0 {
                    return Some(combined);
                }
            }
        }
    }
    // Try single word numbers
    for token in tokens {
        if let Some(n) = word_to_number(token) {
            if n > 0.0 && n <= 120.0 {
                return Some(n);
            }
        }
    }
    None
}

fn extract_cruise_speed(tokens: &[&str]) -> Option<f64> {
    // Strong triggers — always try to extract speed
    let strong = tokens.iter().any(|t| *t == "cruise" || *t == "set");
    // Weak triggers — only match if a number is also present
    let weak = tokens.iter().any(|t| *t == "speed" || *t == "drive" || *t == "go");

    if !strong && !weak {
        return None;
    }

    let number = extract_number(tokens);

    // Strong triggers always return the number (even None)
    if strong {
        return number;
    }

    // Weak triggers only match when a number is found
    // (avoids "go left" matching as cruise)
    number
}
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
        VoiceIntent::Resume => Some(MissionUpdate {
            mode: Some(MissionMode::Cruise),
            cruise_target_speed_mph: None,
            speed_delta_mph: None,
            lane_change_direction: None,
            source: MissionSource::Voice,
        }),
        VoiceIntent::PullOver => Some(MissionUpdate {
            mode: Some(MissionMode::LaneChange),
            cruise_target_speed_mph: None,
            speed_delta_mph: None,
            lane_change_direction: Some(LaneChangeDirection::Right),
            source: MissionSource::Voice,
        }),
        VoiceIntent::MaintainSpeed => Some(MissionUpdate {
            mode: Some(MissionMode::Cruise),
            cruise_target_speed_mph: Some(0.0), // 0 signals "use current speed"
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
