use actix_web::{web, HttpResponse};
use std::sync::Mutex;

use crate::api::types::*;
use crate::mission::state::MissionSource;
use crate::physics::world::World;
use crate::rl::recorder::EpisodeRecorder;
use crate::scenario::loader::ScenarioLoader;
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

pub async fn get_scenarios(
    scenario_loader: web::Data<Mutex<ScenarioLoader>>,
) -> HttpResponse {
    let loader = scenario_loader.lock().unwrap();
    let scenarios = loader.list_scenarios();
    HttpResponse::Ok().json(scenarios)
}

#[derive(serde::Deserialize)]
pub struct LoadScenarioRequest {
    pub name: String,
}

pub async fn post_load_scenario(
    body: web::Json<LoadScenarioRequest>,
    world: web::Data<Mutex<World>>,
    traffic: web::Data<Mutex<TrafficManager>>,
    scenario_loader: web::Data<Mutex<ScenarioLoader>>,
) -> HttpResponse {
    let mut world = world.lock().unwrap();
    let mut traffic = traffic.lock().unwrap();
    let mut loader = scenario_loader.lock().unwrap();

    match loader.apply_scenario(&body.name, &mut world, &mut traffic) {
        Ok(summary) => HttpResponse::Ok().json(summary),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

pub async fn post_record_start(
    recorder: web::Data<Mutex<EpisodeRecorder>>,
) -> HttpResponse {
    let mut recorder = recorder.lock().unwrap();
    let recordings_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/recordings");
    match recorder.start(recordings_dir.to_str().unwrap_or("data/recordings")) {
        Ok(filename) => HttpResponse::Ok().json(serde_json::json!({
            "status": "recording_started",
            "filename": filename,
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

pub async fn post_record_stop(
    recorder: web::Data<Mutex<EpisodeRecorder>>,
) -> HttpResponse {
    let mut recorder = recorder.lock().unwrap();
    match recorder.stop() {
        Ok(summary) => HttpResponse::Ok().json(summary),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

pub async fn get_record_status(
    recorder: web::Data<Mutex<EpisodeRecorder>>,
) -> HttpResponse {
    let recorder = recorder.lock().unwrap();
    let status = crate::rl::recorder::RecordingStatus::from(&*recorder);
    HttpResponse::Ok().json(status)
}
