use serde::{Deserialize, Serialize};

use crate::config::*;
use crate::route::geometry::RoadSpline;

/// Lane-keeping PD controller gains for the straight-road physics path.
/// Kp steers proportionally to lateral offset from lane center (deg per meter).
/// Kd steers proportionally to heading error to damp oscillation (deg per radian).
const LANE_KEEP_KP: f64 = 4.0;
const LANE_KEEP_KD: f64 = 40.0;

/// In Frenet (road-spline) mode, the lateral offset is in the road's local frame.
/// Same PD structure but tuned for the spline coordinate system.
const LANE_KEEP_FRENET_KP: f64 = 4.0;
const LANE_KEEP_FRENET_KD: f64 = 40.0;

/// When the driver is actively steering, we still apply a reduced heading-alignment
/// correction to prevent the car from going perpendicular to the road.
const HEADING_ASSIST_GAIN: f64 = 15.0;

/// Steering input commands below this threshold are treated as "no manual steering,"
/// allowing full lane-keep authority.
const MANUAL_STEER_DEADZONE: f64 = 0.02;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LaneKeepMode {
    /// Full automatic lane centering (no manual input).
    FullAuto,
    /// Manual steering is active; only apply heading alignment assist.
    AssistOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum VehicleType {
    Sedan,
    Suv,
    Truck,
    SportsCar,
    Motorcycle,
}

impl VehicleType {
    pub fn dimensions(&self) -> (f64, f64) {
        match self {
            VehicleType::Sedan => (4.5, 1.8),
            VehicleType::Suv => (5.0, 2.0),
            VehicleType::Truck => (6.0, 2.2),
            VehicleType::SportsCar => (4.2, 1.9),
            VehicleType::Motorcycle => (2.2, 0.8),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            VehicleType::Sedan => "sedan",
            VehicleType::Suv => "suv",
            VehicleType::Truck => "truck",
            VehicleType::SportsCar => "sports-car",
            VehicleType::Motorcycle => "motorcycle",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Vehicle {
    pub id: String,
    pub vehicle_type: VehicleType,
    pub lane_index: usize,
    pub lateral_offset: f64,
    pub speed_mps: f64,
    pub steer_angle_deg: f64,
    pub heading_rad: f64,
    pub position_x: f64,
    pub position_z: f64,
    pub throttle: f64,
    pub brake: f64,
    pub behavior: Option<String>,
    pub position_s: f64,
    pub lateral_t: f64,
    pub road_heading: f64,
    pub curvature: f64,
    /// Raw normalized steering input from the player (-1..1). Used to determine
    /// whether manual steering is active for lane-keep blending.
    pub raw_steer_input: f64,
    /// The lane the lane-keeping controller should target. Set by mission control
    /// when a lane change or overtake is in progress, otherwise defaults to current lane.
    /// This unifies mission-control steering with vehicle-level lane-keeping into a
    /// single PD controller.
    pub steering_target_lane: Option<usize>,
}

impl Vehicle {
    pub fn new(id: String, vehicle_type: VehicleType, lane_index: usize) -> Self {
        Self {
            id,
            vehicle_type,
            lane_index,
            lateral_offset: 0.0,
            speed_mps: 0.0,
            steer_angle_deg: 0.0,
            heading_rad: 0.0,
            position_x: lane_center(lane_index),
            position_z: 0.0,
            throttle: 0.0,
            brake: 0.0,
            behavior: None,
            position_s: 0.0,
            lateral_t: 0.0,
            road_heading: 0.0,
            curvature: 0.0,
            raw_steer_input: 0.0,
            steering_target_lane: None,
        }
    }

    pub fn speed_mph(&self) -> f64 {
        self.speed_mps * MPS_TO_MPH
    }

    pub fn gear(&self) -> u8 {
        let mph = self.speed_mph();
        if mph < 5.0 {
            1
        } else if mph < 15.0 {
            2
        } else if mph < 30.0 {
            3
        } else if mph < 50.0 {
            4
        } else if mph < 80.0 {
            5
        } else {
            6
        }
    }

    fn effective_target_lane(&self) -> usize {
        self.steering_target_lane.unwrap_or(self.lane_index)
    }

    /// Compute lane-keeping steering correction for the straight-road path.
    /// In FullAuto mode, applies proportional correction on lateral error and
    /// derivative correction on heading to smoothly center the car.
    /// In AssistOnly mode, only applies heading alignment to prevent perpendicular drift.
    fn lane_keep_steer_straight(&self, mode: LaneKeepMode, dt: f64) -> f64 {
        let target_x = lane_center(self.effective_target_lane());
        let lateral_error = target_x - self.position_x;
        let heading_error = -self.heading_rad;

        match mode {
            LaneKeepMode::FullAuto => {
                let desired = LANE_KEEP_KP * lateral_error + LANE_KEEP_KD * heading_error;
                let max_delta = STEER_RATE_DEG_PER_S * dt;
                let delta = (desired - self.steer_angle_deg).clamp(-max_delta, max_delta);
                (self.steer_angle_deg + delta).clamp(-MAX_STEER_DEG, MAX_STEER_DEG)
            }
            LaneKeepMode::AssistOnly => {
                let correction = HEADING_ASSIST_GAIN * heading_error;
                let max_delta = STEER_RATE_DEG_PER_S * dt;
                let delta = correction.clamp(-max_delta, max_delta);
                (self.steer_angle_deg + delta).clamp(-MAX_STEER_DEG, MAX_STEER_DEG)
            }
        }
    }

    pub fn step(&mut self, dt: f64) {
        self.apply_lane_keeping(dt);

        let max_speed_mps = MAX_SPEED_MPH * MPH_TO_MPS;

        let accel = self.throttle * 10.0;
        let decel = self.brake * BRAKE_RATE_MPH_PER_S * MPH_TO_MPS;
        let drag = AERO_DRAG_COEFF * self.speed_mps * self.speed_mps;
        let rolling = if self.speed_mps > 0.01 {
            ROLLING_RESIST_MPS2
        } else {
            0.0
        };

        let net_accel = accel - decel - drag - rolling;
        self.speed_mps = (self.speed_mps + net_accel * dt).clamp(0.0, max_speed_mps);

        let steer_rad = self.steer_angle_deg.to_radians();
        if WHEELBASE_METERS > 0.0 {
            let turn_rate = (self.speed_mps / WHEELBASE_METERS) * steer_rad.tan();
            self.heading_rad += turn_rate * dt;
        }

        self.position_x += self.speed_mps * self.heading_rad.sin() * dt;
        self.position_z += self.speed_mps * self.heading_rad.cos() * dt;

        // Track arc-length even without a road spline
        self.position_s += self.speed_mps * dt;

        let target_x = lane_center(self.lane_index);
        self.lateral_offset = self.position_x - target_x;

        self.lane_index = closest_lane(self.position_x);
    }

    /// Apply lane-keeping steering. Called at the beginning of each step
    /// before the bicycle model integrates.
    fn apply_lane_keeping(&mut self, dt: f64) {
        if self.speed_mps < 0.5 {
            return;
        }

        if self.raw_steer_input.abs() > MANUAL_STEER_DEADZONE {
            // Manual steering active: use the player's input directly,
            // with a small heading-alignment assist layered on top.
            let manual_deg = self.raw_steer_input * MAX_STEER_DEG;
            let heading_correction = HEADING_ASSIST_GAIN * (-self.heading_rad) * 0.3;
            let max_delta = STEER_RATE_DEG_PER_S * dt;
            let target = manual_deg + heading_correction;
            let delta = (target - self.steer_angle_deg).clamp(-max_delta, max_delta);
            self.steer_angle_deg = (self.steer_angle_deg + delta).clamp(-MAX_STEER_DEG, MAX_STEER_DEG);
        } else {
            // No manual input: full lane-keep centering
            self.steer_angle_deg = self.lane_keep_steer_straight(LaneKeepMode::FullAuto, dt);
        };
    }

    /// Compute lane-keeping steering for the Frenet (road-spline) path.
    /// lateral_t is the vehicle's lateral position in road-local coordinates.
    /// The target is the lane_offset for the current lane.
    fn lane_keep_steer_frenet(&self, road: &RoadSpline, mode: LaneKeepMode, dt: f64) -> f64 {
        let target_t = road.lane_offset(self.effective_target_lane());
        let lateral_error = target_t - self.lateral_t;

        match mode {
            LaneKeepMode::FullAuto => {
                let desired = LANE_KEEP_FRENET_KP * lateral_error
                    + LANE_KEEP_FRENET_KD * (-self.steer_angle_deg.to_radians());
                let max_delta = STEER_RATE_DEG_PER_S * dt;
                let delta = (desired - self.steer_angle_deg).clamp(-max_delta, max_delta);
                (self.steer_angle_deg + delta).clamp(-MAX_STEER_DEG, MAX_STEER_DEG)
            }
            LaneKeepMode::AssistOnly => {
                let correction = HEADING_ASSIST_GAIN * (-self.steer_angle_deg.to_radians());
                let max_delta = STEER_RATE_DEG_PER_S * dt;
                let delta = correction.clamp(-max_delta, max_delta);
                (self.steer_angle_deg + delta).clamp(-MAX_STEER_DEG, MAX_STEER_DEG)
            }
        }
    }

    /// Apply lane-keeping for the Frenet path. Called before integrating dynamics.
    fn apply_lane_keeping_on_road(&mut self, road: &RoadSpline, dt: f64) {
        if self.speed_mps < 0.5 {
            return;
        }

        if self.raw_steer_input.abs() > MANUAL_STEER_DEADZONE {
            // Manual steering active: use the player's input directly,
            // with a small heading-alignment assist layered on top.
            let manual_deg = self.raw_steer_input * MAX_STEER_DEG;
            let heading_correction = HEADING_ASSIST_GAIN * (-self.steer_angle_deg.to_radians()) * 0.3;
            let max_delta = STEER_RATE_DEG_PER_S * dt;
            let target = manual_deg + heading_correction;
            let delta = (target - self.steer_angle_deg).clamp(-max_delta, max_delta);
            self.steer_angle_deg = (self.steer_angle_deg + delta).clamp(-MAX_STEER_DEG, MAX_STEER_DEG);
        } else {
            // No manual input: full lane-keep centering
            self.steer_angle_deg = self.lane_keep_steer_frenet(road, LaneKeepMode::FullAuto, dt);
        };
    }

    pub fn step_on_road(&mut self, road: &RoadSpline, dt: f64) {
        self.apply_lane_keeping_on_road(road, dt);

        let max_speed_mps = MAX_SPEED_MPH * MPH_TO_MPS;

        let accel = self.throttle * 10.0;
        let decel = self.brake * BRAKE_RATE_MPH_PER_S * MPH_TO_MPS;
        let drag = AERO_DRAG_COEFF * self.speed_mps * self.speed_mps;
        let rolling = if self.speed_mps > 0.01 {
            ROLLING_RESIST_MPS2
        } else {
            0.0
        };

        let net_accel = accel - decel - drag - rolling;
        self.speed_mps = (self.speed_mps + net_accel * dt).clamp(0.0, max_speed_mps);

        let steer_rad = self.steer_angle_deg.to_radians();
        let turn_rate = if WHEELBASE_METERS > 0.0 {
            (self.speed_mps / WHEELBASE_METERS) * steer_rad.tan()
        } else {
            0.0
        };

        let ds_dt = self.speed_mps;
        let dt_dt = self.speed_mps * turn_rate * dt;

        self.position_s += ds_dt * dt;
        self.lateral_t += dt_dt;

        self.position_s = self.position_s.clamp(0.0, road.total_length);

        if let Some(point) = road.sample_at_s(self.position_s) {
            self.road_heading = point.heading;
            self.curvature = point.curvature;

            let normal_x = -point.heading.sin();
            let normal_z = point.heading.cos();
            self.position_x = point.x + self.lateral_t * normal_x;
            self.position_z = point.z + self.lateral_t * normal_z;

            self.heading_rad = point.heading + turn_rate * dt;
        }

        self.lateral_offset = self.lateral_t - road.lane_offset(self.lane_index);
        self.lane_index = road.closest_lane(self.lateral_t);
    }

    pub fn bounding_box(&self) -> (f64, f64, f64, f64) {
        let (length, width) = self.vehicle_type.dimensions();
        let half_l = length / 2.0;
        let half_w = width / 2.0;
        (
            self.position_x - half_w,
            self.position_z - half_l,
            self.position_x + half_w,
            self.position_z + half_l,
        )
    }
}

pub fn lane_center(index: usize) -> f64 {
    (index as f64) * LANE_WIDTH_METERS
}

pub fn closest_lane(x: f64) -> usize {
    let lane_f = (x / LANE_WIDTH_METERS).round().max(0.0);
    (lane_f as usize).min(NUM_LANES - 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_vehicle(lane: usize) -> Vehicle {
        Vehicle::new("test".to_string(), VehicleType::Sedan, lane)
    }

    #[test]
    fn throttle_increases_speed() {
        let mut v = make_vehicle(2);
        v.throttle = 1.0;
        let before = v.speed_mps;
        v.step(PHYSICS_DT);
        assert!(v.speed_mps > before, "throttle should accelerate the vehicle");
    }

    #[test]
    fn braking_from_speed_decreases_speed() {
        let mut v = make_vehicle(2);
        v.speed_mps = 20.0;
        v.brake = 1.0;
        let before = v.speed_mps;
        v.step(PHYSICS_DT);
        assert!(v.speed_mps < before, "braking should decelerate the vehicle");
    }

    #[test]
    fn speed_never_goes_negative() {
        let mut v = make_vehicle(2);
        v.speed_mps = 0.1;
        v.brake = 1.0;
        for _ in 0..100 {
            v.step(PHYSICS_DT);
        }
        assert!(v.speed_mps >= 0.0, "speed must not go negative");
    }

    #[test]
    fn speed_clamped_to_max() {
        let mut v = make_vehicle(2);
        v.speed_mps = MAX_SPEED_MPH * MPH_TO_MPS;
        v.throttle = 1.0;
        v.step(PHYSICS_DT);
        assert!(
            v.speed_mps <= MAX_SPEED_MPH * MPH_TO_MPS,
            "speed must not exceed max"
        );
    }

    #[test]
    fn steering_changes_heading() {
        let mut v = make_vehicle(2);
        v.speed_mps = 20.0;
        v.steer_angle_deg = 10.0;
        v.raw_steer_input = 0.5;
        let before = v.heading_rad;
        v.step(PHYSICS_DT);
        assert!(
            (v.heading_rad - before).abs() > 1e-9,
            "steering should change heading"
        );
    }

    #[test]
    fn closest_lane_clamps_negative_x() {
        let lane = closest_lane(-100.0);
        assert_eq!(lane, 0, "negative x should clamp to lane 0");
    }

    #[test]
    fn closest_lane_clamps_large_x() {
        let lane = closest_lane(10000.0);
        assert_eq!(lane, NUM_LANES - 1, "very large x should clamp to last lane");
    }

    #[test]
    fn gear_returns_valid_range() {
        let mut v = make_vehicle(2);
        for speed_mph in [0.0, 10.0, 20.0, 40.0, 65.0, 100.0] {
            v.speed_mps = speed_mph * MPH_TO_MPS;
            let g = v.gear();
            assert!((1..=6).contains(&g), "gear {g} out of range for speed {speed_mph} mph");
        }
    }

    #[test]
    fn lane_keeping_centers_offset_vehicle() {
        let mut v = make_vehicle(2);
        v.speed_mps = 20.0;
        v.throttle = 0.05;
        v.position_x = lane_center(2) + 1.0;
        v.lateral_offset = 1.0;

        for _ in 0..300 {
            v.step(PHYSICS_DT);
        }

        let offset = (v.position_x - lane_center(v.lane_index)).abs();
        assert!(
            offset < 0.15,
            "lane keeping should center the vehicle, offset={offset:.3}"
        );
    }

    #[test]
    fn lane_keeping_corrects_heading() {
        let mut v = make_vehicle(2);
        v.speed_mps = 25.0;
        v.throttle = 0.05;
        v.heading_rad = 0.15;

        for _ in 0..300 {
            v.step(PHYSICS_DT);
        }

        assert!(
            v.heading_rad.abs() < 0.05,
            "lane keeping should align heading with road, heading={:.4}",
            v.heading_rad
        );
    }

    #[test]
    fn lane_keeping_inactive_at_low_speed() {
        let mut v = make_vehicle(2);
        v.speed_mps = 0.3;
        v.steer_angle_deg = 5.0;
        v.step(PHYSICS_DT);
        assert!(
            (v.steer_angle_deg - 5.0).abs() < 0.01,
            "lane keeping should not adjust steering below speed threshold"
        );
    }

    #[test]
    fn manual_steer_prevents_full_lane_keep() {
        let mut v = make_vehicle(2);
        v.speed_mps = 20.0;
        v.throttle = 0.05;
        v.raw_steer_input = 0.5;
        v.steer_angle_deg = 0.5 * MAX_STEER_DEG;

        let steer_before = v.steer_angle_deg;
        v.step(PHYSICS_DT);

        // In AssistOnly mode, the controller only applies heading correction,
        // not full lateral centering. The steer should not jump to zero.
        assert!(
            v.steer_angle_deg.abs() > 1.0,
            "manual steer should prevent full lane-keep override, steer={:.2} (was {:.2})",
            v.steer_angle_deg,
            steer_before
        );
    }

    #[test]
    fn steering_target_lane_overrides_current_lane() {
        let mut v = make_vehicle(2);
        v.speed_mps = 20.0;
        v.throttle = 0.05;
        v.steering_target_lane = Some(3);

        for _ in 0..600 {
            v.step(PHYSICS_DT);
        }

        let target_x = lane_center(3);
        let offset = (v.position_x - target_x).abs();
        assert!(
            offset < 0.3,
            "vehicle should steer toward target lane 3, offset={offset:.3} from lane center"
        );
    }
}
