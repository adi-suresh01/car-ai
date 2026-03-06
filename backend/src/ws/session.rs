use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use futures_util::StreamExt;
use log::{error, info, warn};
use std::sync::Mutex;
use tokio::sync::broadcast;

use crate::api::types::WsClientMessage;
use crate::physics::world::World;
use crate::voice::intent::{intent_confidence, intent_to_mission_update, parse_utterance};
use crate::voice::routes::{apply_mission_update, describe_intent};

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
                    if let Some(response) = handle_client_message(&text, &world_clone) {
                        let _ = session.text(bytestring::ByteString::from(response)).await;
                    }
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

fn handle_client_message(text: &str, world: &web::Data<Mutex<World>>) -> Option<String> {
    let parsed: Result<WsClientMessage, _> = serde_json::from_str(text);
    match parsed {
        Ok(WsClientMessage::PlayerInput {
            steering,
            throttle,
            brake,
        }) => {
            let mut w = world.lock().unwrap();
            w.set_manual_input(steering, throttle, brake);
            None
        }
        Ok(WsClientMessage::VoiceCommand { utterance }) => {
            let utterance = utterance.trim().to_string();
            if utterance.is_empty() {
                warn!("Empty WS voice command received");
                return None;
            }
            info!("WS voice command: {:?}", utterance);
            let intent = parse_utterance(&utterance);
            let message = describe_intent(&intent);
            let confidence = intent_confidence(&intent, &utterance);
            if let Some(update) = intent_to_mission_update(&intent) {
                let mut w = world.lock().unwrap();
                apply_mission_update(&mut w, &update);
                Some(serde_json::json!({
                    "type": "voice_response",
                    "intent": format!("{:?}", intent),
                    "acknowledged": true,
                    "message": message,
                    "confidence": confidence,
                }).to_string())
            } else {
                warn!("Could not parse voice command: {}", utterance);
                Some(serde_json::json!({
                    "type": "voice_response",
                    "intent": "Unknown",
                    "acknowledged": false,
                    "message": format!("I didn't understand: {}", utterance),
                    "confidence": confidence,
                }).to_string())
            }
        }
        Ok(WsClientMessage::Ping {}) => {
            Some(serde_json::json!({
                "type": "pong",
                "timestamp": std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            }).to_string())
        }
        Err(e) => {
            error!("Failed to parse WebSocket message: {}", e);
            None
        }
    }
}
