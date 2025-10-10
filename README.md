# VoiceDrive Simulator

Voice-first driving simulator prototype that blends a Road Rash-inspired aesthetic with a structured backend for future voice command and reinforcement learning integrations.

## Project layout

- `apps/frontend` – Vite + React + Three.js experience rendering a split-screen cockpit and tactical overview.
- `apps/backend` – Express + TypeScript service exposing simulation layout metadata for California freeway scenes.
- `docs/` – Architecture notes and next steps (see `docs/roadmap.md`).

The codebase follows an MVC-style separation both on the server (controllers/routes/services/models) and the client (controllers/services/models/views/state).

## Getting started

### Backend

```bash
cd apps/backend
npm install
npm run dev
```

The server listens on `http://localhost:4000` and exposes `GET /health` and `GET /api/simulation/layout` for the frontend to consume.

Set environment variables before running voice or intent integrations:

```bash
XI_API_KEY=...
XI_WEBHOOK_SECRET=...
FIREWORKS_API_KEY=...
```

Additional endpoints:

- `POST /api/voice/transcriptions` → Proxies audio URLs to ElevenLabs speech-to-text.
- `POST /api/voice/intent` → Calls Fireworks.ai to produce structured driving intents.
- `POST /api/voice/synthesize` → Returns base64 audio using ElevenLabs text-to-speech.
- `POST /api/voice/webhooks/elevenlabs` → Receives ElevenLabs webhook events (raw body required).

### Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to the backend, so both processes should run simultaneously during development.

## Next milestones

1. **Voice agent loop** – integrate ElevenLabs Agents for low-latency STT/TTS and Fireworks.ai for intent parsing; expose controller functions for lane changes, speed targets, and exit handling.
2. **Dynamics & RL** – extend the simulation service to emit dynamic traffic snapshots, build a browser-friendly physics layer, and train a PPO baseline that executes LLM-derived goals.
3. **Telemetry & Evals** – wire Convex.dev for logging, leaderboards, and automated eval suites covering command adherence, smoothness, and safety metrics.
4. **Scenario authoring** – expand the backend scene catalog (CA-101, CA-1, I-280) with metadata for exits, express lanes, and traffic pacing to drive tutorial modules.

## Tech stack

- Rendering: Three.js via `@react-three/fiber` + custom styling for high-FPS faux-CRT feel.
- State: Zustand store orchestrating layout load and vehicle snapshots.
- Backend: Express + TypeScript with structured services and shared models.

See `docs/roadmap.md` for a deeper sponsor-aligned plan.
