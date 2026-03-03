use super::vehicle::Vehicle;

pub fn aabb_overlap(a: &(f64, f64, f64, f64), b: &(f64, f64, f64, f64)) -> bool {
    a.0 < b.2 && a.2 > b.0 && a.1 < b.3 && a.3 > b.1
}

pub fn check_collision(a: &Vehicle, b: &Vehicle) -> bool {
    let bb_a = a.bounding_box();
    let bb_b = b.bounding_box();
    aabb_overlap(&bb_a, &bb_b)
}

pub fn check_player_collisions(player: &Vehicle, npcs: &[Vehicle]) -> bool {
    let player_bb = player.bounding_box();
    for npc in npcs {
        if aabb_overlap(&player_bb, &npc.bounding_box()) {
            return true;
        }
    }
    false
}

pub fn gap_to_vehicle_ahead(
    reference: &Vehicle,
    lane_index: usize,
    vehicles: &[Vehicle],
) -> (f64, f64) {
    let mut min_gap = f64::MAX;
    let mut rel_speed = 0.0;
    for v in vehicles {
        if v.id == reference.id {
            continue;
        }
        if v.lane_index != lane_index {
            continue;
        }
        let dz = v.position_z - reference.position_z;
        if dz > 0.0 && dz < min_gap {
            min_gap = dz;
            rel_speed = v.speed_mps - reference.speed_mps;
        }
    }
    (min_gap, rel_speed)
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
    fn aabb_overlap_returns_true_for_overlapping_boxes() {
        // a: x [0,4], z [0,4]
        let a = (0.0_f64, 0.0_f64, 4.0_f64, 4.0_f64);
        // b: x [2,6], z [2,6] — overlaps a
        let b = (2.0_f64, 2.0_f64, 6.0_f64, 6.0_f64);
        assert!(aabb_overlap(&a, &b), "overlapping boxes should return true");
    }

    #[test]
    fn aabb_overlap_returns_false_for_separated_boxes() {
        // a: x [0,2], z [0,2]
        let a = (0.0_f64, 0.0_f64, 2.0_f64, 2.0_f64);
        // b: x [5,7], z [5,7] — no overlap
        let b = (5.0_f64, 5.0_f64, 7.0_f64, 7.0_f64);
        assert!(!aabb_overlap(&a, &b), "separated boxes should return false");
    }

    #[test]
    fn aabb_overlap_returns_false_for_touching_edges() {
        // a: x [0,2], z [0,2]
        let a = (0.0_f64, 0.0_f64, 2.0_f64, 2.0_f64);
        // b: x [2,4], z [0,2] — touching but not overlapping
        let b = (2.0_f64, 0.0_f64, 4.0_f64, 2.0_f64);
        assert!(
            !aabb_overlap(&a, &b),
            "edge-touching boxes should not count as overlap"
        );
    }

    #[test]
    fn check_player_collisions_detects_overlap() {
        let player = make_vehicle_at("player", 0.0, 0.0);
        // Place NPC directly on top of player
        let npc = make_vehicle_at("npc-001", 0.0, 0.0);
        assert!(
            check_player_collisions(&player, &[npc]),
            "vehicle at same position should collide"
        );
    }

    #[test]
    fn check_player_collisions_no_overlap_when_far() {
        let player = make_vehicle_at("player", 0.0, 0.0);
        // NPC far behind
        let npc = make_vehicle_at("npc-001", 0.0, -200.0);
        assert!(
            !check_player_collisions(&player, &[npc]),
            "vehicles far apart should not collide"
        );
    }

    #[test]
    fn check_player_collisions_empty_npc_list() {
        let player = make_vehicle_at("player", 0.0, 0.0);
        assert!(
            !check_player_collisions(&player, &[]),
            "no NPCs means no collision"
        );
    }
}

pub fn gap_to_vehicle_behind(
    reference: &Vehicle,
    lane_index: usize,
    vehicles: &[Vehicle],
) -> (f64, f64) {
    let mut min_gap = f64::MAX;
    let mut rel_speed = 0.0;
    for v in vehicles {
        if v.id == reference.id {
            continue;
        }
        if v.lane_index != lane_index {
            continue;
        }
        let dz = reference.position_z - v.position_z;
        if dz > 0.0 && dz < min_gap {
            min_gap = dz;
            rel_speed = reference.speed_mps - v.speed_mps;
        }
    }
    (min_gap, rel_speed)
}
