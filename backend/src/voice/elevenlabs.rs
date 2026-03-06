use log::{info, warn};
use std::time::Duration;

const STT_URL: &str = "https://api.elevenlabs.io/v1/speech-to-text";
const STT_MODEL: &str = "scribe_v1";
const TTS_MODEL: &str = "eleven_multilingual_v2";
const DEFAULT_VOICE_ID: &str = "21m00Tcm4TlvDq8ikWAM";
const HTTP_TIMEOUT_SECS: u64 = 30;
const HTTP_CONNECT_TIMEOUT_SECS: u64 = 10;
const MAX_RETRIES: usize = 3;

/// Wraps raw PCM16-LE mono samples in a minimal WAV container.
/// The frontend sends 16kHz 16-bit signed LE PCM; ElevenLabs expects
/// a playable audio file, so we prepend the 44-byte RIFF/WAV header.
fn pcm_to_wav(pcm_data: &[u8], sample_rate: u32, channels: u16, bits_per_sample: u16) -> Vec<u8> {
    let data_size = pcm_data.len() as u32;
    let byte_rate = sample_rate * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;
    let file_size = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + pcm_data.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&file_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // PCM chunk size
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM format
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());
    wav.extend_from_slice(pcm_data);
    wav
}

pub struct ElevenLabsClient {
    api_key: Option<String>,
    voice_id: String,
    tts_model: String,
    stt_model: String,
    http: reqwest::Client,
}

impl ElevenLabsClient {
    pub fn new(api_key: Option<String>) -> Self {
        let voice_id = std::env::var("XI_VOICE_ID")
            .unwrap_or_else(|_| DEFAULT_VOICE_ID.to_string());
        let tts_model = std::env::var("XI_TTS_MODEL")
            .unwrap_or_else(|_| TTS_MODEL.to_string());
        let stt_model = std::env::var("XI_STT_MODEL")
            .unwrap_or_else(|_| STT_MODEL.to_string());

        if api_key.as_ref().is_none_or(|k| k.is_empty()) {
            warn!("XI_API_KEY is not set; ElevenLabs STT/TTS endpoints will return 503");
        } else {
            info!("ElevenLabs client initialized with API key");
        }

        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .connect_timeout(Duration::from_secs(HTTP_CONNECT_TIMEOUT_SECS))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        info!("ElevenLabs config: voice_id={}, tts_model={}, stt_model={}", voice_id, tts_model, stt_model);

        Self {
            api_key,
            voice_id,
            tts_model,
            stt_model,
            http,
        }
    }

    pub fn has_api_key(&self) -> bool {
        self.api_key.as_ref().is_some_and(|k| !k.is_empty())
    }

    pub async fn transcribe(&self, audio_data: &[u8]) -> Result<String, String> {
        let api_key = match self.require_api_key() {
            Some(k) => k,
            None => return Err("ElevenLabs API key not configured".to_string()),
        };

        // The frontend sends raw 16kHz 16-bit signed LE PCM.
        // ElevenLabs requires a playable audio file, so wrap in a WAV container.
        let wav_data = pcm_to_wav(audio_data, 16000, 1, 16);

        let mut last_err = String::new();
        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                warn!("STT retry attempt {}/{}", attempt + 1, MAX_RETRIES);
                tokio::time::sleep(Duration::from_millis(500 * attempt as u64)).await;
            }

            let audio_part = reqwest::multipart::Part::bytes(wav_data.clone())
                .file_name("audio.wav")
                .mime_str("audio/wav")
                .map_err(|e| format!("Failed to create multipart part: {}", e))?;

            let form = reqwest::multipart::Form::new()
                .text("model_id", self.stt_model.clone())
                .part("file", audio_part);

            let resp = match self
                .http
                .post(STT_URL)
                .header("xi-api-key", &api_key)
                .multipart(form)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    last_err = format!("ElevenLabs STT request failed: {}", e);
                    continue;
                }
            };

            if resp.status().is_server_error() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                last_err = format!("ElevenLabs STT error {}: {}", status, body);
                continue;
            }

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("ElevenLabs STT error {}: {}", status, body));
            }

            let json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse STT response: {}", e))?;

            return json.get("text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("No 'text' field in STT response: {}", json));
        }

        Err(last_err)
    }

    pub async fn synthesize(&self, text: &str) -> Result<Vec<u8>, String> {
        let api_key = match self.require_api_key() {
            Some(k) => k,
            None => return Err("ElevenLabs API key not configured".to_string()),
        };

        let url = format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{}",
            self.voice_id
        );

        let json_body = serde_json::json!({
            "text": text,
            "model_id": self.tts_model,
        });

        let mut last_err = String::new();
        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                warn!("TTS retry attempt {}/{}", attempt + 1, MAX_RETRIES);
                tokio::time::sleep(Duration::from_millis(500 * attempt as u64)).await;
            }

            let resp = match self
                .http
                .post(&url)
                .header("xi-api-key", &api_key)
                .header("Accept", "audio/mpeg")
                .json(&json_body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    last_err = format!("ElevenLabs TTS request failed: {}", e);
                    continue;
                }
            };

            if resp.status().is_server_error() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                last_err = format!("ElevenLabs TTS error {}: {}", status, body);
                continue;
            }

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("ElevenLabs TTS error {}: {}", status, body));
            }

            return resp.bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(|e| format!("Failed to read TTS audio bytes: {}", e));
        }

        Err(last_err)
    }

    fn require_api_key(&self) -> Option<String> {
        match &self.api_key {
            Some(k) if !k.is_empty() => Some(k.clone()),
            _ => {
                warn!("ElevenLabs API key not configured");
                None
            }
        }
    }
}
