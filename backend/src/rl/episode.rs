use serde::{Deserialize, Serialize};

use crate::rl::environment::{RLAction, RLEnvironment};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeTransition {
    pub observation: Vec<f64>,
    pub action: [f64; 3],
    pub reward: f64,
    pub next_observation: Vec<f64>,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeSummary {
    pub total_reward: f64,
    pub episode_length: u64,
    pub collision: bool,
    pub distance_traveled: f64,
    pub avg_speed_mph: f64,
}

pub fn generate_random_episode(max_steps: u64) -> (Vec<EpisodeTransition>, EpisodeSummary) {
    let mut env = RLEnvironment::new();
    let obs = env.reset();
    let mut transitions = Vec::new();
    let mut total_reward = 0.0;
    let mut speed_sum = 0.0;
    let mut current_obs = obs;
    let mut rng = rand::thread_rng();

    for _ in 0..max_steps {
        let action = RLAction {
            throttle: rand::Rng::gen_range(&mut rng, 0.0..0.5),
            brake: rand::Rng::gen_range(&mut rng, 0.0..0.1),
            lane_request: rand::Rng::gen_range(&mut rng, -0.3..0.3),
        };

        let result = env.step(&action);

        transitions.push(EpisodeTransition {
            observation: current_obs.to_vec(),
            action: [action.throttle, action.brake, action.lane_request],
            reward: result.reward,
            next_observation: result.observation.to_vec(),
            done: result.done || result.truncated,
        });

        total_reward += result.reward;
        speed_sum += result.info.speed_mph;
        current_obs = result.observation.clone();

        if result.done || result.truncated {
            break;
        }
    }

    let episode_length = transitions.len() as u64;
    let avg_speed = if episode_length > 0 {
        speed_sum / episode_length as f64
    } else {
        0.0
    };

    let summary = EpisodeSummary {
        total_reward,
        episode_length,
        collision: env.world.collision,
        distance_traveled: env.total_distance,
        avg_speed_mph: avg_speed,
    };

    (transitions, summary)
}
