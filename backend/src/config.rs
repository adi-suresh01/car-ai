pub const LANE_WIDTH_METERS: f64 = 3.6;
pub const WHEELBASE_METERS: f64 = 2.8;
pub const MAX_SPEED_MPH: f64 = 120.0;
pub const MAX_STEER_DEG: f64 = 38.0;
pub const STEER_RATE_DEG_PER_S: f64 = 140.0;
#[allow(dead_code)]
pub const PHYSICS_HZ: u32 = 60;
pub const PHYSICS_DT: f64 = 1.0 / 60.0;
pub const ROLLING_RESIST_MPS2: f64 = 0.15;
pub const AERO_DRAG_COEFF: f64 = 0.0032;
pub const BRAKE_RATE_MPH_PER_S: f64 = 90.0;

pub const MPH_TO_MPS: f64 = 0.44704;
pub const MPS_TO_MPH: f64 = 1.0 / MPH_TO_MPS;

pub const NPC_DESPAWN_DISTANCE: f64 = 1200.0;
pub const NPC_SPAWN_DISTANCE: f64 = -320.0;

pub const NUM_LANES: usize = 5;

/// Speed limit per lane (fast lane on left to slow lane on right).
pub fn lane_speed_limit(lane_index: usize) -> f64 {
    match lane_index {
        0 => 75.0,
        1 => 70.0,
        2 => 65.0,
        3 => 60.0,
        _ => 55.0,
    }
}

#[allow(dead_code)]
pub struct ServerConfig {
    pub port: u16,
    pub xi_api_key: Option<String>,
    pub xi_webhook_secret: Option<String>,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        Self {
            port: std::env::var("PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4000),
            xi_api_key: non_empty_env("XI_API_KEY"),
            xi_webhook_secret: non_empty_env("XI_WEBHOOK_SECRET"),
        }
    }
}

fn non_empty_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .filter(|v| !v.is_empty())
}
