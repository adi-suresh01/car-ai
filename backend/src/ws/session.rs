use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use futures_util::StreamExt;
use log::{error, info, warn};
use std::sync::Mutex;
use tokio::sync::broadcast;

use crate::api::types::WsClientMessage;
use crate::physics::world::World;
use crate::voice::intent::{intent_to_mission_update, parse_utterance};

pub async fn ws_handler(
    req: HttpRequest,
    stream: web::Payload,
    world: web::Data<Mutex<World>>,
    broadcast_rx: web::Data<broadcast::Sender<String>>,
) -> Result<HttpResponse, actix_web::Error> {
    let (resp, mut session, msg_stream) = actix_ws::handle(&req, stream)?;

    let mut rx = broadcast_rx.subscribe();
    let world_clone = world.clone();

    actix_rt::spawn(async move {
        let mut send_session = session.clone();

        let send_task = actix_rt::spawn(async move {
            while let Ok(state_json) = rx.recv().await {
                if send_session
                    .text(bytestring::ByteString::from(state_json))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        });

        let mut msg_stream = msg_stream;
        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Text(text) => {
                    handle_client_message(&text, &world_clone);
                }
                Message::Close(_) => {
                    info!("WebSocket client disconnected");
                    break;
                }
                Message::Ping(data) => {
                    if session.pong(&data).await.is_err() {
                        break;
                    }
                }
                _ => {}
            }
        }

        send_task.abort();
        let _ = session.close(None).await;
    });

    Ok(resp)
}

fn handle_client_message(text: &str, world: &web::Data<Mutex<World>>) {
    let parsed: Result<WsClientMessage, _> = serde_json::from_str(text);
    match parsed {
        Ok(WsClientMessage::PlayerInput {
            steering,
            throttle,
            brake,
        }) => {
            let mut w = world.lock().unwrap();
            w.set_manual_input(steering, throttle, brake);
        }
        Ok(WsClientMessage::VoiceCommand { utterance }) => {
            let intent = parse_utterance(&utterance);
            if let Some(update) = intent_to_mission_update(&intent) {
                let mut w = world.lock().unwrap();
                match update.mode {
                    Some(crate::mission::state::MissionMode::Cruise) => {
                        if let Some(speed) = update.cruise_target_speed_mph {
                            w.mission.set_cruise(speed, update.source);
                        }
                    }
                    Some(crate::mission::state::MissionMode::LaneChange) => {
                        if let Some(dir) = update.lane_change_direction {
                            let lane = w.player.lane_index;
                            w.mission.set_lane_change(dir, lane, update.source);
                        }
                    }
                    Some(crate::mission::state::MissionMode::Overtake) => {
                        let lane = w.player.lane_index;
                        w.mission.set_overtake(lane, update.source);
                    }
                    Some(crate::mission::state::MissionMode::Hold) => {
                        w.mission.set_hold(update.source);
                    }
                    None => {}
                }
            } else {
                warn!("Could not parse voice command: {}", utterance);
            }
        }
        Err(e) => {
            error!("Failed to parse WebSocket message: {}", e);
        }
    }
}
