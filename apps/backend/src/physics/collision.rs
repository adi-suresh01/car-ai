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
