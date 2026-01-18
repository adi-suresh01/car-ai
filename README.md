# VoiceDrive Simulator

Voice-controlled driving simulator with a split-screen cockpit view, live traffic, and an RL-ready environment.

## Overview

VoiceDrive is a prototype that combines a high-fidelity browser simulator (React + Three.js) with a TypeScript backend for traffic, missions, and voice-driven control. The codebase is structured to support real-time voice commands, reinforcement learning experiments, and scenario-based evaluations.

## Project layout

- `apps/frontend` – Vite + React + Three.js experience with driver POV + tactical overview.
- `apps/backend` – Express + TypeScript simulation service (traffic, missions, voice).
- `apps/training` – Python RL training stack (PPO/DQN + ONNX export).
- `docs/` – Architecture notes, plans, and integration guides.

## Quick start

### 1) Backend

```bash
cd apps/backend
npm install
npm run dev
```

Backend runs on `http://localhost:4000`.

### 2) Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies `/api` to the backend.

### 3) Environment variables

Set these in `apps/backend/.env`:

```bash
XI_API_KEY=...
XI_WEBHOOK_SECRET=...
FIREWORKS_API_KEY=...
```

## Voice endpoints

- `POST /api/voice/transcriptions` – STT from audio URLs.
- `POST /api/voice/transcriptions/file` – STT from raw audio uploads.
- `POST /api/voice/command` – Apply a voice command to the mission.
- `POST /api/voice/intent` – Fireworks intent parsing (applies mission updates).
- `POST /api/voice/synthesize` – TTS (base64 audio).
- `POST /api/voice/webhooks/elevenlabs` – ElevenLabs webhooks.

## Simulation endpoints

- `GET /api/simulation/layout` – Scene metadata.
- `GET /api/simulation/state` – Snapshot (player, traffic, mission, voice status).
- `POST /api/simulation/mission` – Update mission targets.
- `POST /api/simulation/traffic/reset` – Reset NPC traffic.
- `POST /api/simulation/traffic/spawn` – Spawn a scripted vehicle.
- `POST /api/simulation/player` – Sync player state to backend.
- `GET /api/simulation/scenario` – Scenario seed/config.

## RL training

See `docs/rl-training.md` for the full pipeline. The RL environment mirrors the TS simulator and is used to train PPO/DQN controllers, export ONNX, and run eval suites.

## Tech stack

- Rendering: Three.js via `@react-three/fiber`
- State: Zustand
- Backend: Express + TypeScript
- RL: Python (Stable-Baselines3) + ONNX export

## Notes

- Run backend + frontend together for voice control and traffic sync.
- For scenario-driven training, see `data/scenarios/*.json`.

See `docs/roadmap.md` for planned milestones.
