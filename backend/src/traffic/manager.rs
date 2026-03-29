use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::config::*;
use crate::physics::collision::{gap_to_vehicle_ahead, gap_to_vehicle_behind};
use crate::physics::vehicle::{lane_center, Vehicle, VehicleType};
use crate::traffic::policies::{
    lane_speed_limit_mps, target_speed_for_policy, NpcPolicy, PolicyDistribution, PolicyId,
};

const TARGET_NPC_COUNT: usize = 12;
const NPC_POOL_CAPACITY: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcSnapshot {
    pub id: String,
    pub policy_id: String,
    pub lane_index: usize,
    pub speed_mps: f64,
    pub position_x: f64,
    pub position_z: f64,
}

pub struct NpcState {
    pub policy: NpcPolicy,
    pub target_speed_mps: f64,
    pub lane_change_cooldown: u32,
}

pub struct TrafficManager {
    npc_states: Vec<NpcState>,
    next_id: u32,
    target_npc_count: usize,
    policy_distribution: PolicyDistribution,
    recycled_vehicles: Vec<Vehicle>,
}

impl TrafficManager {
    pub fn new() -> Self {
        Self {
            npc_states: Vec::new(),
            next_id: 1,
            target_npc_count: TARGET_NPC_COUNT,
            policy_distribution: PolicyDistribution::default(),
            recycled_vehicles: Vec::with_capacity(NPC_POOL_CAPACITY),
        }
    }

    #[allow(dead_code)]
    pub fn with_config(target_count: usize, distribution: PolicyDistribution) -> Self {
        Self {
            npc_states: Vec::new(),
            next_id: 1,
            target_npc_count: target_count,
            policy_distribution: distribution,
            recycled_vehicles: Vec::with_capacity(NPC_POOL_CAPACITY),
        }
    }

    pub fn set_target_count(&mut self, count: usize) {
        self.target_npc_count = count;
    }

    pub fn set_policy_distribution(&mut self, dist: PolicyDistribution) {
        self.policy_distribution = dist;
    }

    pub fn spawn_initial(&mut self, npcs: &mut Vec<Vehicle>) {
        let mut rng = rand::thread_rng();
        for i in 0..self.target_npc_count {
            let lane = i % NUM_LANES;
            let z_offset = (i as f64) * 80.0 - 200.0;
            self.spawn_npc(npcs, lane, z_offset, &mut rng);
        }
    }

    pub fn tick(&mut self, player_z: f64, npcs: &mut Vec<Vehicle>) {
        let mut rng = rand::thread_rng();

        self.despawn_distant(player_z, npcs);

        while npcs.len() < self.target_npc_count {
            let lane = rng.gen_range(0..NUM_LANES);
            let z = player_z + NPC_SPAWN_DISTANCE - rng.gen_range(0.0..200.0);
            self.spawn_npc(npcs, lane, z, &mut rng);
        }

        self.update_npc_behavior(npcs, &mut rng);
    }

    pub fn reset(&mut self, npcs: &mut Vec<Vehicle>) {
        for v in npcs.drain(..) {
            self.recycle_vehicle(v);
        }
        self.npc_states.clear();
        self.spawn_initial(npcs);
    }

    #[allow(dead_code)]
    pub fn npc_snapshots(&self, npcs: &[Vehicle]) -> Vec<NpcSnapshot> {
        npcs.iter()
            .zip(self.npc_states.iter())
            .map(|(v, state)| NpcSnapshot {
                id: v.id.clone(),
                policy_id: state.policy.id.as_str().to_string(),
                lane_index: v.lane_index,
                speed_mps: v.speed_mps,
                position_x: v.position_x,
                position_z: v.position_z,
            })
            .collect()
    }

    fn recycle_vehicle(&mut self, mut vehicle: Vehicle) {
        if self.recycled_vehicles.len() < NPC_POOL_CAPACITY {
            vehicle.speed_mps = 0.0;
            vehicle.throttle = 0.0;
            vehicle.brake = 0.0;
            vehicle.steer_angle_deg = 0.0;
            vehicle.heading_rad = 0.0;
            vehicle.lateral_offset = 0.0;
            vehicle.behavior = None;
            vehicle.position_s = 0.0;
            vehicle.lateral_t = 0.0;
            vehicle.road_heading = 0.0;
            vehicle.curvature = 0.0;
            self.recycled_vehicles.push(vehicle);
        }
    }

    fn take_recycled_or_new(
        &mut self,
        id: String,
        vehicle_type: VehicleType,
        lane: usize,
    ) -> Vehicle {
        if let Some(mut v) = self.recycled_vehicles.pop() {
            v.id = id;
            v.vehicle_type = vehicle_type;
            v.lane_index = lane;
            v.position_x = lane_center(lane);
            v.position_z = 0.0;
            v.speed_mps = 0.0;
            v.throttle = 0.0;
            v.brake = 0.0;
            v.steer_angle_deg = 0.0;
            v.heading_rad = 0.0;
            v.lateral_offset = 0.0;
            v.behavior = None;
            v.position_s = 0.0;
            v.lateral_t = 0.0;
            v.road_heading = 0.0;
            v.curvature = 0.0;
            v.raw_steer_input = 0.0;
            v.steering_target_lane = None;
            v
        } else {
            Vehicle::new(id, vehicle_type, lane)
        }
    }

    fn spawn_npc(&mut self, npcs: &mut Vec<Vehicle>, lane: usize, z: f64, rng: &mut impl Rng) {
        let id = format!("npc-{:03}", self.next_id);
        self.next_id += 1;

        let vehicle_type = match rng.gen_range(0..5) {
            0 => VehicleType::Sedan,
            1 => VehicleType::Suv,
            2 => VehicleType::Truck,
            3 => VehicleType::SportsCar,
            _ => VehicleType::Motorcycle,
        };

        let mut npc = self.take_recycled_or_new(id, vehicle_type, lane);
        npc.position_x = lane_center(lane);
        npc.position_z = z;

        let policy_id = PolicyId::from_distribution(&self.policy_distribution, rng);
        let policy = NpcPolicy::from_id(policy_id, rng);
        let target_speed = target_speed_for_policy(&policy, lane, rng);
        npc.speed_mps = target_speed;
        npc.behavior = match policy_id {
            PolicyId::Defensive => Some("defensive".into()),
            PolicyId::Aggressive => Some("aggressive".into()),
            PolicyId::Cruiser => Some("cruiser".into()),
            PolicyId::Random => None,
        };

        npcs.push(npc);
        self.npc_states.push(NpcState {
            policy,
            target_speed_mps: target_speed,
            lane_change_cooldown: 0,
        });
    }

    fn despawn_distant(&mut self, player_z: f64, npcs: &mut Vec<Vehicle>) {
        let mut i = 0;
        while i < npcs.len() {
            let dist = (npcs[i].position_z - player_z).abs();
            if dist > NPC_DESPAWN_DISTANCE {
                let removed = npcs.swap_remove(i);
                self.npc_states.swap_remove(i);
                self.recycle_vehicle(removed);
            } else {
                i += 1;
            }
        }
    }

    fn update_npc_behavior(&mut self, npcs: &mut [Vehicle], rng: &mut impl Rng) {
        let len = npcs.len().min(self.npc_states.len());

        for i in 0..len {
            if self.npc_states[i].lane_change_cooldown > 0 {
                self.npc_states[i].lane_change_cooldown -= 1;
            }
        }

        let mut lane_changes: Vec<(usize, usize)> = Vec::with_capacity(4);

        for i in 0..len {
            let lane = npcs[i].lane_index;
            let policy = self.npc_states[i].policy;
            let target_speed = self.npc_states[i].target_speed_mps;
            let lane_limit = lane_speed_limit_mps(lane);
            let effective_target = target_speed.min(lane_limit * (1.0 / policy.speed_adherence));

            let (gap_ahead, _rel_speed_ahead) = gap_to_vehicle_ahead(&npcs[i], lane, npcs);

            if gap_ahead < policy.following_gap_m {
                npcs[i].throttle = 0.0;
                let urgency = 1.0 - (gap_ahead / policy.following_gap_m).max(0.0);
                npcs[i].brake = (urgency * policy.brake_gain * 2.0).min(0.6);

                if self.npc_states[i].lane_change_cooldown == 0
                    && gap_ahead < policy.following_gap_m * 0.6
                {
                    if let Some(target_lane) =
                        self.find_better_lane(i, npcs, &policy)
                    {
                        lane_changes.push((i, target_lane));
                    }
                }
            } else {
                let speed_error = effective_target - npcs[i].speed_mps;
                if speed_error > 0.5 {
                    npcs[i].throttle = (speed_error * policy.throttle_gain).min(0.8);
                    npcs[i].brake = 0.0;
                } else if speed_error < -0.5 {
                    npcs[i].throttle = 0.0;
                    npcs[i].brake = (speed_error.abs() * policy.brake_gain).min(0.5);
                } else {
                    npcs[i].throttle = 0.02;
                    npcs[i].brake = 0.0;
                }

                if self.npc_states[i].lane_change_cooldown == 0 {
                    let roll: f64 = rng.gen();
                    if roll < policy.lane_change_probability {
                        if let Some(target_lane) =
                            self.find_better_lane(i, npcs, &policy)
                        {
                            lane_changes.push((i, target_lane));
                        }
                    }
                }
            }

            let target_x = lane_center(lane);
            let lateral_error = target_x - npcs[i].position_x;
            npcs[i].steer_angle_deg =
                (lateral_error * 5.0).clamp(-MAX_STEER_DEG, MAX_STEER_DEG);
        }

        for (npc_idx, target_lane) in lane_changes {
            if npc_idx < npcs.len() && npc_idx < self.npc_states.len() {
                npcs[npc_idx].lane_index = target_lane;
                self.npc_states[npc_idx].lane_change_cooldown = 180;

                let policy = self.npc_states[npc_idx].policy;
                self.npc_states[npc_idx].target_speed_mps =
                    target_speed_for_policy(&policy, target_lane, rng);
            }
        }
    }

    fn find_better_lane(
        &self,
        npc_idx: usize,
        npcs: &[Vehicle],
        policy: &NpcPolicy,
    ) -> Option<usize> {
        let current_lane = npcs[npc_idx].lane_index;
        let mut best_lane = None;
        let mut best_gap = 0.0_f64;

        let candidates: [Option<usize>; 2] = [
            if current_lane > 0 {
                Some(current_lane - 1)
            } else {
                None
            },
            if current_lane < NUM_LANES - 1 {
                Some(current_lane + 1)
            } else {
                None
            },
        ];

        for candidate in candidates.into_iter().flatten() {
            let (gap_ahead, _) = gap_to_vehicle_ahead(&npcs[npc_idx], candidate, npcs);
            let (gap_behind, _) = gap_to_vehicle_behind(&npcs[npc_idx], candidate, npcs);

            if gap_ahead > policy.lane_change_min_gap
                && gap_behind > policy.lane_change_min_gap * 0.5
                && gap_ahead > best_gap
            {
                best_gap = gap_ahead;
                best_lane = Some(candidate);
            }
        }

        best_lane
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_initial_creates_target_count() {
        let mut manager = TrafficManager::new();
        let mut npcs = Vec::new();
        manager.spawn_initial(&mut npcs);
        assert_eq!(npcs.len(), TARGET_NPC_COUNT);
        assert_eq!(manager.npc_states.len(), TARGET_NPC_COUNT);
    }

    #[test]
    fn each_npc_has_a_policy() {
        let mut manager = TrafficManager::new();
        let mut npcs = Vec::new();
        manager.spawn_initial(&mut npcs);
        for state in &manager.npc_states {
            assert!(matches!(
                state.policy.id,
                PolicyId::Defensive | PolicyId::Aggressive | PolicyId::Cruiser | PolicyId::Random
            ));
        }
    }

    #[test]
    fn reset_clears_and_respawns() {
        let mut manager = TrafficManager::new();
        let mut npcs = Vec::new();
        manager.spawn_initial(&mut npcs);
        manager.reset(&mut npcs);
        assert_eq!(npcs.len(), TARGET_NPC_COUNT);
    }

    #[test]
    fn despawn_recycles_to_pool() {
        let mut manager = TrafficManager::new();
        let mut npcs = Vec::new();
        manager.spawn_initial(&mut npcs);
        assert!(manager.recycled_vehicles.is_empty());

        npcs[0].position_z = 999999.0;
        manager.despawn_distant(0.0, &mut npcs);
        assert!(!manager.recycled_vehicles.is_empty());
    }

    #[test]
    fn npc_snapshots_returns_correct_count() {
        let mut manager = TrafficManager::new();
        let mut npcs = Vec::new();
        manager.spawn_initial(&mut npcs);
        let snapshots = manager.npc_snapshots(&npcs);
        assert_eq!(snapshots.len(), TARGET_NPC_COUNT);
    }

    #[test]
    fn custom_config_uses_specified_count() {
        let dist = PolicyDistribution {
            defensive: 0.5,
            aggressive: 0.5,
            cruiser: 0.0,
            random: 0.0,
        };
        let mut manager = TrafficManager::with_config(6, dist);
        let mut npcs = Vec::new();
        manager.spawn_initial(&mut npcs);
        assert_eq!(npcs.len(), 6);
    }
}
