use crate::physics::vehicle::Vehicle;

const CELL_SIZE_X: f64 = 7.2;
const CELL_SIZE_Z: f64 = 20.0;

fn cell_key(x: f64, z: f64) -> (i32, i32) {
    (
        (x / CELL_SIZE_X).floor() as i32,
        (z / CELL_SIZE_Z).floor() as i32,
    )
}

pub struct SpatialGrid {
    cells: Vec<((i32, i32), Vec<usize>)>,
}

impl SpatialGrid {
    pub fn build(vehicles: &[Vehicle]) -> Self {
        let capacity = vehicles.len() * 2;
        let mut cells: Vec<((i32, i32), Vec<usize>)> = Vec::with_capacity(capacity);

        for (idx, v) in vehicles.iter().enumerate() {
            let (min_x, min_z, max_x, max_z) = v.bounding_box();
            let key_min = cell_key(min_x, min_z);
            let key_max = cell_key(max_x, max_z);

            for cx in key_min.0..=key_max.0 {
                for cz in key_min.1..=key_max.1 {
                    let key = (cx, cz);
                    if let Some(entry) = cells.iter_mut().find(|(k, _)| *k == key) {
                        entry.1.push(idx);
                    } else {
                        cells.push((key, vec![idx]));
                    }
                }
            }
        }

        Self { cells }
    }

    pub fn query_neighbors(&self, vehicle: &Vehicle) -> Vec<usize> {
        let (min_x, min_z, max_x, max_z) = vehicle.bounding_box();
        let key_min = cell_key(min_x - CELL_SIZE_X, min_z - CELL_SIZE_Z);
        let key_max = cell_key(max_x + CELL_SIZE_X, max_z + CELL_SIZE_Z);

        let mut result = Vec::new();

        for cx in key_min.0..=key_max.0 {
            for cz in key_min.1..=key_max.1 {
                let key = (cx, cz);
                if let Some(entry) = self.cells.iter().find(|(k, _)| *k == key) {
                    for &idx in &entry.1 {
                        if !result.contains(&idx) {
                            result.push(idx);
                        }
                    }
                }
            }
        }

        result
    }
}

pub fn check_player_collisions_spatial(player: &Vehicle, npcs: &[Vehicle]) -> bool {
    if npcs.len() < 16 {
        return super::collision::check_player_collisions(player, npcs);
    }

    let grid = SpatialGrid::build(npcs);
    let candidates = grid.query_neighbors(player);
    let player_bb = player.bounding_box();

    for idx in candidates {
        if idx < npcs.len() && super::collision::aabb_overlap(&player_bb, &npcs[idx].bounding_box())
        {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physics::vehicle::{Vehicle, VehicleType};

    fn make_vehicle_at(id: &str, x: f64, z: f64) -> Vehicle {
        let mut v = Vehicle::new(id.to_string(), VehicleType::Sedan, 2);
        v.position_x = x;
        v.position_z = z;
        v
    }

    #[test]
    fn spatial_grid_detects_nearby_collision() {
        let player = make_vehicle_at("player", 7.2, 0.0);
        let npc = make_vehicle_at("npc-001", 7.2, 0.0);
        assert!(check_player_collisions_spatial(&player, &[npc]));
    }

    #[test]
    fn spatial_grid_no_collision_when_far() {
        let player = make_vehicle_at("player", 7.2, 0.0);
        let npc = make_vehicle_at("npc-001", 7.2, -200.0);
        assert!(!check_player_collisions_spatial(&player, &[npc]));
    }

    #[test]
    fn spatial_grid_handles_many_vehicles() {
        let player = make_vehicle_at("player", 7.2, 0.0);
        let mut npcs = Vec::new();
        for i in 0..50 {
            npcs.push(make_vehicle_at(
                &format!("npc-{:03}", i),
                (i % 5) as f64 * 3.6,
                (i as f64) * 40.0 - 500.0,
            ));
        }
        let result = check_player_collisions_spatial(&player, &npcs);
        assert!(!result, "no NPC should overlap the player at z=0");
    }

    #[test]
    fn spatial_grid_consistent_with_brute_force() {
        let player = make_vehicle_at("player", 7.2, 0.0);
        let mut npcs = Vec::new();
        for i in 0..30 {
            npcs.push(make_vehicle_at(
                &format!("npc-{:03}", i),
                (i % 5) as f64 * 3.6,
                (i as f64) * 30.0 - 200.0,
            ));
        }
        npcs.push(make_vehicle_at("npc-overlap", 7.2, 0.5));

        let brute = super::super::collision::check_player_collisions(&player, &npcs);
        let spatial = check_player_collisions_spatial(&player, &npcs);
        assert_eq!(brute, spatial, "spatial and brute force should agree");
    }
}
