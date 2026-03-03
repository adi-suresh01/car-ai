use actix_web::{web, HttpResponse};
use std::sync::Mutex;

use crate::api::types::*;
use crate::mission::state::MissionSource;
use crate::physics::world::World;
use crate::traffic::manager::TrafficManager;

pub async fn get_health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}

pub async fn get_layout() -> HttpResponse {
    HttpResponse::Ok().json(SimulationLayout::default_highway())
}

pub async fn get_state(world: web::Data<Mutex<World>>) -> HttpResponse {
    let world = world.lock().unwrap();
    let snapshot = SimulationSnapshot::from_world(&world);
    HttpResponse::Ok().json(snapshot)
}

pub async fn post_mission(
    body: web::Json<MissionUpdateRequest>,
    world: web::Data<Mutex<World>>,
) -> HttpResponse {
    let mut world = world.lock().unwrap();

    if let Some(mode) = body.mode {
        match mode {
            crate::mission::state::MissionMode::Cruise => {
                let speed = body.cruise_target_speed_mph.unwrap_or(65.0);
                world.mission.set_cruise(speed, MissionSource::Manual);
            }
            crate::mission::state::MissionMode::LaneChange => {
                if let Some(dir) = body.lane_change_direction {
                    let lane = world.player.lane_index;
                    world.mission.set_lane_change(dir, lane, MissionSource::Manual);
                }
            }
            crate::mission::state::MissionMode::Overtake => {
                let lane = world.player.lane_index;
                world.mission.set_overtake(lane, MissionSource::Manual);
            }
            crate::mission::state::MissionMode::Hold => {
                world.mission.set_hold(MissionSource::Manual);
            }
        }
    }

    HttpResponse::Ok().json(&world.mission)
}

pub async fn post_traffic_reset(
    world: web::Data<Mutex<World>>,
    traffic: web::Data<Mutex<TrafficManager>>,
) -> HttpResponse {
    let mut world = world.lock().unwrap();
    let mut traffic = traffic.lock().unwrap();
    traffic.reset(&mut world.npcs);
    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

pub async fn post_player_input(
    body: web::Json<PlayerInput>,
    world: web::Data<Mutex<World>>,
) -> HttpResponse {
    let mut world = world.lock().unwrap();

    if let Some(steering) = body.steering {
        world.player.steer_angle_deg = steering.clamp(
            -crate::config::MAX_STEER_DEG,
            crate::config::MAX_STEER_DEG,
        );
    }
    if let Some(throttle) = body.throttle {
        world.player.throttle = throttle.clamp(0.0, 1.0);
    }
    if let Some(brake) = body.brake {
        world.player.brake = brake.clamp(0.0, 1.0);
    }

    let snapshot = PlayerSnapshot::from(&world.player);
    HttpResponse::Ok().json(snapshot)
}
