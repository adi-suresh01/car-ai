use rand::Rng;

use crate::config::MPH_TO_MPS;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BehaviorProfile {
    Steady,
    Assertive,
    Cautious,
}

impl BehaviorProfile {
    pub fn random(rng: &mut impl Rng) -> Self {
        match rng.gen_range(0..3) {
            0 => BehaviorProfile::Steady,
            1 => BehaviorProfile::Assertive,
            _ => BehaviorProfile::Cautious,
        }
    }

    pub fn throttle_gain(&self) -> f64 {
        match self {
            BehaviorProfile::Steady => 0.25,
            BehaviorProfile::Assertive => 0.40,
            BehaviorProfile::Cautious => 0.15,
        }
    }

    pub fn following_gap(&self) -> f64 {
        match self {
            BehaviorProfile::Steady => 30.0,
            BehaviorProfile::Assertive => 18.0,
            BehaviorProfile::Cautious => 45.0,
        }
    }
}

pub fn lane_speed_limit_mph(lane_index: usize) -> f64 {
    match lane_index {
        0 => 75.0,
        1 => 70.0,
        2 => 65.0,
        3 => 60.0,
        _ => 55.0,
    }
}

pub fn lane_speed_limit_mps(lane_index: usize) -> f64 {
    lane_speed_limit_mph(lane_index) * MPH_TO_MPS
}

pub fn random_speed_for_lane(lane_index: usize, rng: &mut impl Rng) -> f64 {
    let base = lane_speed_limit_mps(lane_index);
    let variance: f64 = rng.gen_range(-3.0..3.0) * MPH_TO_MPS;
    (base + variance).max(10.0 * MPH_TO_MPS)
}
