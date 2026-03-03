use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::config::MPH_TO_MPS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PolicyId {
    Defensive,
    Aggressive,
    Cruiser,
    Random,
}

impl PolicyId {
    #[allow(dead_code)]
    pub fn random(rng: &mut impl Rng) -> Self {
        match rng.gen_range(0..4) {
            0 => PolicyId::Defensive,
            1 => PolicyId::Aggressive,
            2 => PolicyId::Cruiser,
            _ => PolicyId::Random,
        }
    }

    pub fn from_distribution(weights: &PolicyDistribution, rng: &mut impl Rng) -> Self {
        let roll: f64 = rng.gen();
        let mut cumulative = 0.0;
        cumulative += weights.defensive;
        if roll < cumulative {
            return PolicyId::Defensive;
        }
        cumulative += weights.aggressive;
        if roll < cumulative {
            return PolicyId::Aggressive;
        }
        cumulative += weights.cruiser;
        if roll < cumulative {
            return PolicyId::Cruiser;
        }
        PolicyId::Random
    }

    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            PolicyId::Defensive => "defensive",
            PolicyId::Aggressive => "aggressive",
            PolicyId::Cruiser => "cruiser",
            PolicyId::Random => "random",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDistribution {
    pub defensive: f64,
    pub aggressive: f64,
    pub cruiser: f64,
    pub random: f64,
}

impl Default for PolicyDistribution {
    fn default() -> Self {
        Self {
            defensive: 0.25,
            aggressive: 0.25,
            cruiser: 0.25,
            random: 0.25,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct NpcPolicy {
    #[allow(dead_code)]
    pub id: PolicyId,
    pub following_gap_m: f64,
    pub throttle_gain: f64,
    pub brake_gain: f64,
    pub lane_change_probability: f64,
    pub lane_change_min_gap: f64,
    pub speed_variance_mph: f64,
    pub speed_adherence: f64,
}

impl NpcPolicy {
    pub fn from_id(id: PolicyId, rng: &mut impl Rng) -> Self {
        match id {
            PolicyId::Defensive => Self {
                id,
                following_gap_m: 50.0 + rng.gen_range(0.0..10.0),
                throttle_gain: 0.12,
                brake_gain: 0.20,
                lane_change_probability: 0.001,
                lane_change_min_gap: 60.0,
                speed_variance_mph: rng.gen_range(-3.0..1.0),
                speed_adherence: 0.95,
            },
            PolicyId::Aggressive => Self {
                id,
                following_gap_m: 12.0 + rng.gen_range(0.0..6.0),
                throttle_gain: 0.45,
                brake_gain: 0.10,
                lane_change_probability: 0.015,
                lane_change_min_gap: 20.0,
                speed_variance_mph: rng.gen_range(0.0..8.0),
                speed_adherence: 0.7,
            },
            PolicyId::Cruiser => Self {
                id,
                following_gap_m: 35.0 + rng.gen_range(0.0..5.0),
                throttle_gain: 0.20,
                brake_gain: 0.15,
                lane_change_probability: 0.0005,
                lane_change_min_gap: 45.0,
                speed_variance_mph: rng.gen_range(-1.0..1.0),
                speed_adherence: 0.98,
            },
            PolicyId::Random => {
                let following_gap = rng.gen_range(10.0..55.0);
                Self {
                    id,
                    following_gap_m: following_gap,
                    throttle_gain: rng.gen_range(0.10..0.50),
                    brake_gain: rng.gen_range(0.08..0.25),
                    lane_change_probability: rng.gen_range(0.002..0.02),
                    lane_change_min_gap: rng.gen_range(15.0..50.0),
                    speed_variance_mph: rng.gen_range(-5.0..10.0),
                    speed_adherence: rng.gen_range(0.5..1.0),
                }
            }
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

#[allow(dead_code)]
pub fn lane_speed_limit_mph_custom(lane_index: usize, limits: &[f64]) -> f64 {
    limits.get(lane_index).copied().unwrap_or(55.0)
}

#[allow(dead_code)]
pub fn lane_speed_limit_mps_custom(lane_index: usize, limits: &[f64]) -> f64 {
    lane_speed_limit_mph_custom(lane_index, limits) * MPH_TO_MPS
}

pub fn target_speed_for_policy(
    policy: &NpcPolicy,
    lane_index: usize,
    rng: &mut impl Rng,
) -> f64 {
    let base_mph = lane_speed_limit_mph(lane_index);
    let adjusted = base_mph + policy.speed_variance_mph;
    let jitter: f64 = rng.gen_range(-1.0..1.0);
    (adjusted + jitter).max(15.0) * MPH_TO_MPS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_id_random_produces_valid_variant() {
        let mut rng = rand::thread_rng();
        for _ in 0..100 {
            let id = PolicyId::random(&mut rng);
            assert!(matches!(
                id,
                PolicyId::Defensive | PolicyId::Aggressive | PolicyId::Cruiser | PolicyId::Random
            ));
        }
    }

    #[test]
    fn defensive_policy_has_large_following_gap() {
        let mut rng = rand::thread_rng();
        let policy = NpcPolicy::from_id(PolicyId::Defensive, &mut rng);
        assert!(
            policy.following_gap_m >= 50.0,
            "defensive should have gap >= 50m, got {}",
            policy.following_gap_m
        );
    }

    #[test]
    fn aggressive_policy_has_small_following_gap() {
        let mut rng = rand::thread_rng();
        let policy = NpcPolicy::from_id(PolicyId::Aggressive, &mut rng);
        assert!(
            policy.following_gap_m < 25.0,
            "aggressive should have gap < 25m, got {}",
            policy.following_gap_m
        );
    }

    #[test]
    fn cruiser_rarely_changes_lanes() {
        let mut rng = rand::thread_rng();
        let policy = NpcPolicy::from_id(PolicyId::Cruiser, &mut rng);
        assert!(
            policy.lane_change_probability < 0.001,
            "cruiser should rarely change lanes"
        );
    }

    #[test]
    fn lane_speed_limits_decrease_by_lane() {
        for i in 0..4 {
            assert!(
                lane_speed_limit_mph(i) > lane_speed_limit_mph(i + 1),
                "lane {} should be faster than lane {}",
                i,
                i + 1
            );
        }
    }

    #[test]
    fn policy_distribution_selects_all_types() {
        let mut rng = rand::thread_rng();
        let dist = PolicyDistribution::default();
        let mut counts = [0u32; 4];
        for _ in 0..10000 {
            match PolicyId::from_distribution(&dist, &mut rng) {
                PolicyId::Defensive => counts[0] += 1,
                PolicyId::Aggressive => counts[1] += 1,
                PolicyId::Cruiser => counts[2] += 1,
                PolicyId::Random => counts[3] += 1,
            }
        }
        for (i, &c) in counts.iter().enumerate() {
            assert!(c > 100, "policy variant {} should appear often, got {}", i, c);
        }
    }
}
