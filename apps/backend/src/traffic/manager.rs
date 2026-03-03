use rand::Rng;

use crate::config::*;
use crate::physics::collision::gap_to_vehicle_ahead;
use crate::physics::vehicle::{lane_center, Vehicle, VehicleType};
use crate::traffic::profiles::{random_speed_for_lane, BehaviorProfile, lane_speed_limit_mps};

const TARGET_NPC_COUNT: usize = 12;

pub struct NpcState {
    pub profile: BehaviorProfile,
    pub target_speed_mps: f64,
}

pub struct TrafficManager {
    npc_states: Vec<NpcState>,
    next_id: u32,
}

impl TrafficManager {
    pub fn new() -> Self {
        Self {
            npc_states: Vec::new(),
            next_id: 1,
        }
    }

    pub fn spawn_initial(&mut self, npcs: &mut Vec<Vehicle>) {
        let mut rng = rand::thread_rng();
        for i in 0..TARGET_NPC_COUNT {
            let lane = i % NUM_LANES;
            let z_offset = (i as f64) * 80.0 - 200.0;
            self.spawn_npc(npcs, lane, z_offset, &mut rng);
        }
    }

    pub fn tick(&mut self, player_z: f64, npcs: &mut Vec<Vehicle>) {
        let mut rng = rand::thread_rng();

        self.despawn_distant(player_z, npcs);

        while npcs.len() < TARGET_NPC_COUNT {
            let lane = rng.gen_range(0..NUM_LANES);
            let z = player_z + NPC_SPAWN_DISTANCE - rng.gen_range(0.0..200.0);
            self.spawn_npc(npcs, lane, z, &mut rng);
        }

        self.update_npc_behavior(npcs);
    }

    pub fn reset(&mut self, npcs: &mut Vec<Vehicle>) {
        npcs.clear();
        self.npc_states.clear();
        self.spawn_initial(npcs);
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

        let mut npc = Vehicle::new(id, vehicle_type, lane);
        npc.position_x = lane_center(lane);
        npc.position_z = z;
        npc.speed_mps = random_speed_for_lane(lane, rng);

        let profile = BehaviorProfile::random(rng);
        let target_speed = random_speed_for_lane(lane, rng);

        npcs.push(npc);
        self.npc_states.push(NpcState {
            profile,
            target_speed_mps: target_speed,
        });
    }

    fn despawn_distant(&mut self, player_z: f64, npcs: &mut Vec<Vehicle>) {
        let mut i = 0;
        while i < npcs.len() {
            let dist = (npcs[i].position_z - player_z).abs();
            if dist > NPC_DESPAWN_DISTANCE {
                npcs.swap_remove(i);
                self.npc_states.swap_remove(i);
            } else {
                i += 1;
            }
        }
    }

    fn update_npc_behavior(&mut self, npcs: &mut Vec<Vehicle>) {
        for i in 0..npcs.len() {
            if i >= self.npc_states.len() {
                break;
            }

            let lane = npcs[i].lane_index;
            let profile = self.npc_states[i].profile;
            let target_speed = self.npc_states[i].target_speed_mps;
            let lane_limit = lane_speed_limit_mps(lane);
            let effective_target = target_speed.min(lane_limit);

            let (gap_ahead, _) = gap_to_vehicle_ahead(&npcs[i], lane, npcs);

            let following_gap = profile.following_gap();

            if gap_ahead < following_gap {
                npcs[i].throttle = 0.0;
                npcs[i].brake = 0.15;
            } else {
                let speed_error = effective_target - npcs[i].speed_mps;
                if speed_error > 0.5 {
                    npcs[i].throttle = (speed_error * profile.throttle_gain()).min(0.8);
                    npcs[i].brake = 0.0;
                } else if speed_error < -0.5 {
                    npcs[i].throttle = 0.0;
                    npcs[i].brake = (speed_error.abs() * 0.1).min(0.5);
                } else {
                    npcs[i].throttle = 0.02;
                    npcs[i].brake = 0.0;
                }
            }

            let target_x = lane_center(lane);
            let lateral_error = target_x - npcs[i].position_x;
            npcs[i].steer_angle_deg =
                (lateral_error * 5.0).clamp(-MAX_STEER_DEG, MAX_STEER_DEG);
        }
    }
}
