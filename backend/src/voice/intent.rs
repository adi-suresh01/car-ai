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
    MatchSpeedLimit,
    PullOver,
    Unknown(String),
}

/// Normalize STT output: lowercase, strip punctuation, collapse whitespace.
fn normalize_utterance(utterance: &str) -> String {
    utterance
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

pub fn parse_utterance(utterance: &str) -> VoiceIntent {
    let lower = normalize_utterance(utterance);
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

    if lower.contains("speed limit") || lower.contains("match limit")
        || lower.contains("legal speed") || lower.contains("posted speed")
    {
        return VoiceIntent::MatchSpeedLimit;
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

/// Returns a confidence score (0.0-1.0) for the parsed intent.
/// Higher means more keywords matched the pattern.
pub fn intent_confidence(intent: &VoiceIntent, utterance: &str) -> f64 {
    let lower = normalize_utterance(utterance);
    let word_count = lower.split_whitespace().count().max(1) as f64;

    match intent {
        VoiceIntent::SetCruise { .. } => {
            let mut score = 0.3; // base for having a number
            if lower.contains("cruise") { score += 0.4; }
            if lower.contains("set") { score += 0.2; }
            if lower.contains("mph") || lower.contains("miles") { score += 0.1; }
            score.min(1.0)
        }
        VoiceIntent::SpeedUp { .. } => {
            if lower.contains("speed up") || lower.contains("accelerate") { 0.9 }
            else if lower.contains("faster") { 0.8 }
            else { 0.6 }
        }
        VoiceIntent::SlowDown { .. } => {
            if lower.contains("slow down") || lower.contains("decelerate") { 0.9 }
            else if lower.contains("slower") { 0.8 }
            else { 0.6 }
        }
        VoiceIntent::LaneChange { .. } => {
            if lower.contains("lane") { 0.95 }
            else if lower.contains("merge") || lower.contains("switch") { 0.85 }
            else { 0.7 }
        }
        VoiceIntent::Overtake => {
            if lower.contains("overtake") { 0.95 }
            else if lower.contains("pass") { 0.7 }
            else { 0.5 }
        }
        VoiceIntent::Hold => {
            if lower.contains("stop") || lower.contains("brake") { 0.9 }
            else if lower.contains("hold") || lower.contains("halt") { 0.85 }
            else if lower.contains("cancel") { 0.8 }
            else { 0.6 }
        }
        VoiceIntent::Resume => 0.85,
        VoiceIntent::MaintainSpeed => 0.9,
        VoiceIntent::MatchSpeedLimit => 0.9,
        VoiceIntent::PullOver => {
            if lower.contains("pull over") { 0.95 }
            else if lower.contains("emergency") { 0.9 }
            else { 0.7 }
        }
        VoiceIntent::Unknown(_) => {
            // Lower confidence for shorter unknown utterances
            (1.0 / word_count).min(0.3)
        }
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
        VoiceIntent::MatchSpeedLimit => Some(MissionUpdate {
            mode: Some(MissionMode::Cruise),
            cruise_target_speed_mph: Some(-1.0), // -1 signals "use lane speed limit"
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cruise_speed_numeric() {
        match parse_utterance("cruise 65") {
            VoiceIntent::SetCruise { speed_mph } => assert_eq!(speed_mph, 65.0),
            other => panic!("Expected SetCruise, got {:?}", other),
        }
    }

    #[test]
    fn test_cruise_speed_word() {
        match parse_utterance("set cruise sixty five") {
            VoiceIntent::SetCruise { speed_mph } => assert_eq!(speed_mph, 65.0),
            other => panic!("Expected SetCruise, got {:?}", other),
        }
    }

    #[test]
    fn test_speed_up() {
        match parse_utterance("speed up") {
            VoiceIntent::SpeedUp { delta_mph } => assert_eq!(delta_mph, 5.0),
            other => panic!("Expected SpeedUp, got {:?}", other),
        }
    }

    #[test]
    fn test_speed_up_with_number() {
        match parse_utterance("speed up 10") {
            VoiceIntent::SpeedUp { delta_mph } => assert_eq!(delta_mph, 10.0),
            other => panic!("Expected SpeedUp, got {:?}", other),
        }
    }

    #[test]
    fn test_slow_down() {
        match parse_utterance("slow down") {
            VoiceIntent::SlowDown { .. } => {}
            other => panic!("Expected SlowDown, got {:?}", other),
        }
    }

    #[test]
    fn test_lane_left_variants() {
        for phrase in &["lane left", "go left", "merge left", "left lane", "switch left"] {
            match parse_utterance(phrase) {
                VoiceIntent::LaneChange { direction: LaneChangeDirection::Left } => {}
                other => panic!("Expected LaneChange Left for '{}', got {:?}", phrase, other),
            }
        }
    }

    #[test]
    fn test_lane_right_variants() {
        for phrase in &["lane right", "move right", "right lane", "change right"] {
            match parse_utterance(phrase) {
                VoiceIntent::LaneChange { direction: LaneChangeDirection::Right } => {}
                other => panic!("Expected LaneChange Right for '{}', got {:?}", phrase, other),
            }
        }
    }

    #[test]
    fn test_overtake() {
        match parse_utterance("overtake") {
            VoiceIntent::Overtake => {}
            other => panic!("Expected Overtake, got {:?}", other),
        }
    }

    #[test]
    fn test_hold_variants() {
        for phrase in &["stop", "brake", "hold", "cancel", "nevermind"] {
            match parse_utterance(phrase) {
                VoiceIntent::Hold => {}
                other => panic!("Expected Hold for '{}', got {:?}", phrase, other),
            }
        }
    }

    #[test]
    fn test_resume() {
        match parse_utterance("resume driving") {
            VoiceIntent::Resume => {}
            other => panic!("Expected Resume, got {:?}", other),
        }
    }

    #[test]
    fn test_maintain_speed() {
        match parse_utterance("maintain speed") {
            VoiceIntent::MaintainSpeed => {}
            other => panic!("Expected MaintainSpeed, got {:?}", other),
        }
    }

    #[test]
    fn test_pull_over() {
        match parse_utterance("pull over") {
            VoiceIntent::PullOver => {}
            other => panic!("Expected PullOver, got {:?}", other),
        }
    }

    #[test]
    fn test_speed_limit() {
        match parse_utterance("match the speed limit") {
            VoiceIntent::MatchSpeedLimit => {}
            other => panic!("Expected MatchSpeedLimit, got {:?}", other),
        }
    }

    #[test]
    fn test_unknown() {
        match parse_utterance("play some music") {
            VoiceIntent::Unknown(_) => {}
            other => panic!("Expected Unknown, got {:?}", other),
        }
    }

    #[test]
    fn test_punctuation_stripping() {
        match parse_utterance("Cruise, 65!") {
            VoiceIntent::SetCruise { speed_mph } => assert_eq!(speed_mph, 65.0),
            other => panic!("Expected SetCruise, got {:?}", other),
        }
    }

    #[test]
    fn test_confidence_scores() {
        let intent = parse_utterance("cruise 65");
        assert!(intent_confidence(&intent, "cruise 65") > 0.5);

        let unknown = parse_utterance("blah blah blah");
        assert!(intent_confidence(&unknown, "blah blah blah") < 0.3);
    }
}
