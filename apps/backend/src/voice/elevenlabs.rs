use log::{info, warn};

pub struct ElevenLabsClient {
    api_key: Option<String>,
    http: reqwest::Client,
}

impl ElevenLabsClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            http: reqwest::Client::new(),
        }
    }

    pub async fn transcribe(&self, audio_data: &[u8]) -> Result<String, String> {
        let api_key = match &self.api_key {
            Some(k) if !k.is_empty() => k.clone(),
            _ => {
                warn!("ElevenLabs API key not configured, returning stub transcription");
                return Ok("cruise 65".to_string());
            }
        };

        let part = reqwest::multipart::Part::bytes(audio_data.to_vec())
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| format!("Failed to create multipart: {}", e))?;

        let form = reqwest::multipart::Form::new().part("audio", part);

        let resp = self
            .http
            .post("https://api.elevenlabs.io/v1/speech-to-text")
            .header("xi-api-key", &api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("ElevenLabs STT request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("ElevenLabs STT error {}: {}", status, body));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse STT response: {}", e))?;

        json.get("text")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "No text field in STT response".to_string())
    }

    pub async fn synthesize(&self, text: &str) -> Result<Vec<u8>, String> {
        let api_key = match &self.api_key {
            Some(k) if !k.is_empty() => k.clone(),
            _ => {
                warn!("ElevenLabs API key not configured, returning empty audio");
                return Ok(Vec::new());
            }
        };

        let voice_id = "21m00Tcm4TlvDq8ikWAM";
        let url = format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{}",
            voice_id
        );

        let body = serde_json::json!({
            "text": text,
            "model_id": "eleven_monolingual_v1"
        });

        let resp = self
            .http
            .post(&url)
            .header("xi-api-key", &api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("ElevenLabs TTS request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("ElevenLabs TTS error {}: {}", status, body));
        }

        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("Failed to read TTS audio: {}", e))
    }
}

pub struct FireworksClient {
    api_key: Option<String>,
    http: reqwest::Client,
}

impl FireworksClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            http: reqwest::Client::new(),
        }
    }

    pub async fn parse_intent(&self, utterance: &str) -> Result<String, String> {
        let api_key = match &self.api_key {
            Some(k) if !k.is_empty() => k.clone(),
            _ => {
                info!("Fireworks API key not configured, returning raw utterance");
                return Ok(utterance.to_string());
            }
        };

        let body = serde_json::json!({
            "model": "accounts/fireworks/models/llama-v3p1-8b-instruct",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a driving command parser. Parse the user's voice command into one of: cruise <speed>, lane_left, lane_right, overtake, hold. Respond with only the parsed command."
                },
                {
                    "role": "user",
                    "content": utterance
                }
            ],
            "max_tokens": 50
        });

        let resp = self
            .http
            .post("https://api.fireworks.ai/inference/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Fireworks request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Fireworks error {}: {}", status, body));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Fireworks response: {}", e))?;

        json.pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "No content in Fireworks response".to_string())
    }
}
