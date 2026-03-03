use crate::physics::collision::{gap_to_vehicle_ahead, gap_to_vehicle_behind};
use crate::physics::vehicle::Vehicle;

const MIN_GAP_AHEAD: f64 = 20.0;
const MIN_GAP_BEHIND: f64 = 15.0;

pub fn is_lane_change_safe(
    player: &Vehicle,
    target_lane: usize,
    all_vehicles: &[Vehicle],
) -> bool {
    let (gap_ahead, _) = gap_to_vehicle_ahead(player, target_lane, all_vehicles);
    let (gap_behind, _) = gap_to_vehicle_behind(player, target_lane, all_vehicles);

    gap_ahead > MIN_GAP_AHEAD && gap_behind > MIN_GAP_BEHIND
}

pub fn find_overtake_lane(player: &Vehicle, all_vehicles: &[Vehicle]) -> Option<usize> {
    if player.lane_index == 0 {
        return None;
    }
    let target = player.lane_index - 1;
    if is_lane_change_safe(player, target, all_vehicles) {
        Some(target)
    } else {
        None
    }
}
