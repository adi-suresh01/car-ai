# Voice & Intent Integration Overview

## ElevenLabs (voice layer)
- **Account**: create a free ElevenLabs account and generate an API key; free tier supports generous text-to-speech limits and speech-to-text beta access.
- **Models**: plan to start with `eleven_flash_v2` (low-latency TTS) and `eleven_multilingual_sts_v1` for streaming speech-to-speech; for pure transcription use `universal-1` speech-to-text.
- **Authentication**: supply `XI_API_KEY` via environment variables on the backend.
- **Webhook security**: configure a webhook secret in ElevenLabs dashboard; the backend exposes `/api/webhooks/elevenlabs` to receive events. Store the secret as `XI_WEBHOOK_SECRET` and validate the `x-eleven-signature` header (TODO in service).
- **Speech-to-text flow**: upload captured audio (PCM/Opus) to `https://api.elevenlabs.io/v1/speech-to-text` specifying `model_id` and optional `language`. Responses return transcript + timestamps.
- **Text-to-speech flow**: issue POST requests to `/v1/text-to-speech/{voice_id}` with `model_id` and voice settings; backend helper prepared for future use.

## Fireworks.ai (intent + evals layer)
- **Account**: sign up for Fireworks.ai free tier and create an API key; free plan includes credits for model inference and eval tooling.
- **Models**: recommended starting point `accounts/fireworks/models/llama-v3p1-70b-instruct` for intent parsing with function calling. Store key as `FIREWORKS_API_KEY`.
- **Inference endpoint**: backend provides `FireworksService.generateIntent()` template targeting the chat completions API (`https://api.fireworks.ai/inference/v1/chat/completions`).
- **Evaluations**: once voice loop is running, prepare scenario fixtures and use Fireworks eval protocol to score transcription→intent accuracy and policy outcomes.

Set the following environment variables:

```bash
XI_API_KEY=...
XI_WEBHOOK_SECRET=...
FIREWORKS_API_KEY=...
```

Add them to `.env` (not committed) and ensure the backend process loads them via `src/config/env.ts`.
