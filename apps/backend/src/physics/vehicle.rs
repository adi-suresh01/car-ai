use serde::{Deserialize, Serialize};

use crate::config::*;

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

    pub fn step(&mut self, dt: f64) {
        let max_speed_mps = MAX_SPEED_MPH * MPH_TO_MPS;

        let accel = self.throttle * 6.0;
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

        let target_x = lane_center(self.lane_index);
        self.lateral_offset = self.position_x - target_x;

        self.lane_index = closest_lane(self.position_x);
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
    let lane_f = (x / LANE_WIDTH_METERS).round();
    (lane_f as usize).min(NUM_LANES - 1)
}
