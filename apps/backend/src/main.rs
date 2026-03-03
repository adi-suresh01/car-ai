mod api;
mod config;
mod mission;
mod physics;
mod rl;
mod scenario;
mod traffic;
mod voice;
mod ws;

use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use log::info;
use std::sync::Mutex;
use tokio::sync::broadcast;

use api::simulation::*;
use api::types::SimulationSnapshot;
use config::ServerConfig;
use physics::world::World;
use rl::recorder::EpisodeRecorder;
use scenario::loader::ScenarioLoader;
use traffic::manager::TrafficManager;
use voice::elevenlabs::ElevenLabsClient;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    env_logger::init();

    let server_config = ServerConfig::from_env();
    let port = server_config.port;

    let mut world = World::new();
    let mut traffic_manager = TrafficManager::new();
    traffic_manager.spawn_initial(&mut world.npcs);
    world.mission.set_cruise(65.0, mission::state::MissionSource::System);

    let world_data = web::Data::new(Mutex::new(world));
    let traffic_data = web::Data::new(Mutex::new(traffic_manager));
    let elevenlabs = web::Data::new(ElevenLabsClient::new(server_config.xi_api_key));

    let scenarios_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/scenarios");
    let scenarios_dir = scenarios_dir.as_path();
    let scenario_loader = ScenarioLoader::new(scenarios_dir);
    let scenario_data = web::Data::new(Mutex::new(scenario_loader));

    let recorder = EpisodeRecorder::new();
    let recorder_data = web::Data::new(Mutex::new(recorder));

    let (broadcast_tx, _) = broadcast::channel::<String>(128);
    let broadcast_tx_data = web::Data::new(broadcast_tx.clone());

    let world_for_loop = world_data.clone();
    let traffic_for_loop = traffic_data.clone();
    let recorder_for_loop = recorder_data.clone();
    let tx_for_loop = broadcast_tx.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_micros(16_667));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            let snapshot = {
                let mut world = world_for_loop.lock().unwrap();
                let mut traffic = traffic_for_loop.lock().unwrap();

                world.step();
                traffic.tick(world.player.position_z, &mut world.npcs);

                {
                    let mut rec = recorder_for_loop.lock().unwrap();
                    if rec.is_active() {
                        rec.record_step(&world);
                    }
                }

                SimulationSnapshot::from_world(&world)
            };

            if let Ok(json) = serde_json::to_string(&serde_json::json!({
                "type": "state",
                "timestamp": snapshot.timestamp,
                "player": snapshot.player,
                "vehicles": snapshot.vehicles,
                "mission": snapshot.mission,
                "collision": snapshot.collision,
            })) {
                let _ = tx_for_loop.send(json);
            }
        }
    });

    info!("VoiceDrive backend starting on port {}", port);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(world_data.clone())
            .app_data(traffic_data.clone())
            .app_data(elevenlabs.clone())
            .app_data(broadcast_tx_data.clone())
            .app_data(scenario_data.clone())
            .app_data(recorder_data.clone())
            .route("/api/health", web::get().to(get_health))
            .route("/api/simulation/layout", web::get().to(get_layout))
            .route("/api/simulation/state", web::get().to(get_state))
            .route("/api/simulation/mission", web::post().to(post_mission))
            .route(
                "/api/simulation/traffic/reset",
                web::post().to(post_traffic_reset),
            )
            .route("/api/simulation/player", web::post().to(post_player_input))
            .route("/api/scenarios", web::get().to(get_scenarios))
            .route("/api/scenarios/load", web::post().to(post_load_scenario))
            .route(
                "/api/rl/record/start",
                web::post().to(post_record_start),
            )
            .route(
                "/api/rl/record/stop",
                web::post().to(post_record_stop),
            )
            .route(
                "/api/rl/record/status",
                web::get().to(get_record_status),
            )
            .route(
                "/api/voice/transcribe",
                web::post().to(voice::routes::handle_transcribe),
            )
            .route(
                "/api/voice/command",
                web::post().to(voice::routes::handle_voice_command),
            )
            .route(
                "/api/voice/synthesize",
                web::post().to(voice::routes::handle_synthesize),
            )
            .route(
                "/ws/simulation",
                web::get().to(ws::session::ws_handler),
            )
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
