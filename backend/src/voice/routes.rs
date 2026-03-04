use actix_web::{web, HttpResponse};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::physics::world::World;
use crate::voice::elevenlabs::ElevenLabsClient;
use crate::voice::intent::{intent_to_mission_update, parse_utterance};

#[derive(Deserialize)]
pub struct VoiceCommandRequest {
    pub utterance: String,
}

#[derive(Serialize)]
pub struct TranscribeResponse {
    pub text: String,
}

#[derive(Serialize)]
pub struct SynthesizeResponse {
    pub audio: String,
}

#[derive(Deserialize)]
pub struct SynthesizeRequest {
    pub text: String,
}

pub async fn handle_voice_command(
    body: web::Json<VoiceCommandRequest>,
    world: web::Data<Mutex<World>>,
) -> HttpResponse {
    let intent = parse_utterance(&body.utterance);

    let mut world = world.lock().unwrap();

    if let Some(update) = intent_to_mission_update(&intent) {
        match update.mode {
            Some(crate::mission::state::MissionMode::Cruise) => {
                if let Some(speed) = update.cruise_target_speed_mph {
                    world.mission.set_cruise(speed, update.source);
                }
            }
            Some(crate::mission::state::MissionMode::LaneChange) => {
                if let Some(dir) = update.lane_change_direction {
                    let lane = world.player.lane_index;
                    world.mission.set_lane_change(dir, lane, update.source);
                }
            }
            Some(crate::mission::state::MissionMode::Overtake) => {
                let lane = world.player.lane_index;
                world.mission.set_overtake(lane, update.source);
            }
            Some(crate::mission::state::MissionMode::Hold) => {
                world.mission.set_hold(update.source);
            }
            None => {}
        }
    }

    HttpResponse::Ok().json(&world.mission)
}

pub async fn handle_transcribe(
    body: web::Bytes,
    elevenlabs: web::Data<ElevenLabsClient>,
) -> HttpResponse {
    match elevenlabs.transcribe(&body).await {
        Ok(text) => HttpResponse::Ok().json(TranscribeResponse { text }),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": e })),
    }
}

pub async fn handle_synthesize(
    body: web::Json<SynthesizeRequest>,
    elevenlabs: web::Data<ElevenLabsClient>,
) -> HttpResponse {
    match elevenlabs.synthesize(&body.text).await {
        Ok(audio_bytes) => {
            let encoded = base64::engine::general_purpose::STANDARD.encode(&audio_bytes);
            HttpResponse::Ok().json(SynthesizeResponse { audio: encoded })
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": e })),
    }
}
