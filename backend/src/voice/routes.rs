use actix_web::{web, HttpResponse};
use base64::Engine;
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::physics::world::World;
use crate::voice::elevenlabs::ElevenLabsClient;
use crate::voice::intent::{intent_to_mission_update, parse_utterance, MissionUpdate, VoiceIntent};

/// Apply a parsed mission update to the world state.
/// Shared between REST and WebSocket voice command handlers.
pub fn apply_mission_update(world: &mut World, update: &MissionUpdate) {
    match update.mode {
        Some(crate::mission::state::MissionMode::Cruise) => {
            if let Some(speed) = update.cruise_target_speed_mph {
                if speed == 0.0 {
                    // "maintain speed" — lock cruise to current speed
                    let current = world.player.speed_mph();
                    world.mission.set_cruise(current, update.source);
                } else if speed < 0.0 {
                    // "speed limit" — use lane speed limit
                    let lane = world.player.lane_index;
                    let limit = crate::config::lane_speed_limit(lane);
                    world.mission.set_cruise(limit, update.source);
                } else {
                    world.mission.set_cruise(speed, update.source);
                }
            } else if let Some(delta) = update.speed_delta_mph {
                let new_speed = (world.mission.cruise_target_speed_mph + delta).clamp(0.0, 120.0);
                world.mission.set_cruise(new_speed, update.source);
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

#[derive(Deserialize)]
pub struct VoiceCommandRequest {
    pub utterance: String,
}

#[derive(Serialize)]
pub struct VoiceCommandResponse {
    pub intent: String,
    pub acknowledged: bool,
    pub message: String,
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

pub async fn handle_voice_health(
    elevenlabs: web::Data<ElevenLabsClient>,
) -> HttpResponse {
    let has_key = elevenlabs.has_api_key();
    HttpResponse::Ok().json(serde_json::json!({
        "status": if has_key { "ready" } else { "no_api_key" },
        "stt_available": has_key,
        "tts_available": has_key,
    }))
}

pub fn describe_intent(intent: &VoiceIntent) -> String {
    match intent {
        VoiceIntent::SetCruise { speed_mph } => format!("Setting cruise to {} mph", speed_mph),
        VoiceIntent::SpeedUp { delta_mph } => format!("Speeding up by {} mph", delta_mph),
        VoiceIntent::SlowDown { delta_mph } => format!("Slowing down by {} mph", delta_mph),
        VoiceIntent::LaneChange { direction } => format!("Changing lane {:?}", direction),
        VoiceIntent::Overtake => "Overtaking".to_string(),
        VoiceIntent::Hold => "Holding position".to_string(),
        VoiceIntent::Resume => "Resuming cruise".to_string(),
        VoiceIntent::PullOver => "Pulling over to the right".to_string(),
        VoiceIntent::MaintainSpeed => "Locking current speed".to_string(),
        VoiceIntent::MatchSpeedLimit => "Matching lane speed limit".to_string(),
        VoiceIntent::Unknown(u) => format!("Unknown command: {}", u),
    }
}

pub async fn handle_voice_command(
    body: web::Json<VoiceCommandRequest>,
    world: web::Data<Mutex<World>>,
) -> HttpResponse {
    let utterance = body.utterance.trim();
    if utterance.is_empty() {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Empty utterance" }));
    }
    info!("Voice command received: {:?}", utterance);
    let intent = parse_utterance(utterance);
    debug!("Parsed voice intent: {:?}", intent);

    let mut world = world.lock().unwrap();

    let intent_name = format!("{:?}", intent);
    if let Some(update) = intent_to_mission_update(&intent) {
        info!("Applying mission update: {:?}", update);
        apply_mission_update(&mut world, &update);
        let message = describe_intent(&intent);
        HttpResponse::Ok().json(VoiceCommandResponse {
            intent: intent_name,
            acknowledged: true,
            message,
        })
    } else {
        warn!("No mission update for intent: {:?}", intent);
        HttpResponse::Ok().json(VoiceCommandResponse {
            intent: intent_name,
            acknowledged: false,
            message: format!("I didn't understand: {}", body.utterance),
        })
    }
}

pub async fn handle_transcribe(
    body: web::Bytes,
    elevenlabs: web::Data<ElevenLabsClient>,
) -> HttpResponse {
    if !elevenlabs.has_api_key() {
        return HttpResponse::ServiceUnavailable()
            .json(serde_json::json!({ "error": "ElevenLabs API key not configured" }));
    }
    info!("Transcribe request: {} bytes of audio", body.len());
    if body.is_empty() {
        warn!("Empty audio data received for transcription");
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Empty audio data" }));
    }
    if body.len() < 100 {
        warn!("Audio data too short: {} bytes", body.len());
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Audio data too short" }));
    }
    if body.len() > 25 * 1024 * 1024 {
        warn!("Audio data too large: {} bytes", body.len());
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Audio data exceeds 25MB limit" }));
    }
    match elevenlabs.transcribe(&body).await {
        Ok(text) => {
            info!("Transcription result: {:?}", text);
            HttpResponse::Ok().json(TranscribeResponse { text })
        }
        Err(e) => {
            warn!("Transcription failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({ "error": e }))
        }
    }
}

pub async fn handle_synthesize(
    body: web::Json<SynthesizeRequest>,
    elevenlabs: web::Data<ElevenLabsClient>,
) -> HttpResponse {
    if !elevenlabs.has_api_key() {
        return HttpResponse::ServiceUnavailable()
            .json(serde_json::json!({ "error": "ElevenLabs API key not configured" }));
    }
    info!("Synthesize request: {:?}", body.text);
    match elevenlabs.synthesize(&body.text).await {
        Ok(audio_bytes) => {
            info!("Synthesis complete: {} bytes", audio_bytes.len());
            let encoded = base64::engine::general_purpose::STANDARD.encode(&audio_bytes);
            HttpResponse::Ok().json(SynthesizeResponse { audio: encoded })
        }
        Err(e) => {
            warn!("Synthesis failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({ "error": e }))
        }
    }
}
