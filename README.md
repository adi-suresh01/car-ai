# VoiceDrive

A voice-controlled driving simulator with real-time reinforcement learning.

## Overview

VoiceDrive is a real-time driving simulator where you sit in the driver's seat and control your car using natural voice commands. Say "cruise 65" to set cruise control, "lane left" to change lanes, or "overtake" to pass slower traffic. AI-driven NPC vehicles share the road, each running its own reinforcement learning policy to produce realistic autonomous driving behavior.

The simulation runs a 60Hz physics loop on the backend with a bicycle dynamics model, streams state to a 3D frontend over WebSocket, and supports voice interaction through ElevenLabs STT/TTS.

## Tech Stack

**Backend** -- Rust, Actix-Web, Actix-WS, Tokio, Serde

- 60Hz physics engine (bicycle model, AABB collision detection)
- WebSocket server for real-time state broadcast
- REST API for simulation control and voice routing
- Grammar-based voice intent parser
- ElevenLabs STT/TTS proxy
- Gymnasium-compatible RL environment for training data generation

**Frontend** -- React 19, TypeScript, Vite, Three.js

- First-person cockpit view via `@react-three/fiber` and `@react-three/drei`
- GLTF/GLB vehicle models with PBR materials and HDRI lighting
- Zustand state management with WebSocket sync
- HUD overlay (speedometer, gear, mission status, voice indicator)
- ONNX Runtime Web for browser-side RL policy inference
- Voice capture with streaming STT

**Training** -- Python, stable-baselines3, Gymnasium, PyTorch

- PPO training with vectorized environments
- ONNX export for browser inference
- Multi-agent NPC policy training

## Project Structure

```
car-ai/
  apps/
    backend/       Rust simulation server (Actix-Web, port 4000)
    frontend/      React + Three.js client (Vite, port 5173)
    training/      Python RL training pipeline (PPO, ONNX export)
  data/
    scenarios/     Scenario configuration files
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) >= 18
- [Python](https://python.org/) >= 3.10 (for RL training only)

### Backend

```sh
cd apps/backend
cargo build
cargo run
```

The server starts on `http://localhost:4000`.

### Frontend

```sh
cd apps/frontend
npm install
npm run dev
```

The dev server starts on `http://localhost:5173` and proxies `/api` and `/ws` requests to the backend.

## Environment Variables

Create a `.env` file in the project root or in `apps/backend/`:

```
PORT=4000
RUST_LOG=info
XI_API_KEY=<your-elevenlabs-api-key>
```

The ElevenLabs API key is optional. Without it, voice transcription and synthesis endpoints return graceful error responses and the rest of the simulator functions normally.

Frontend environment (optional, defaults shown):

```
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000/ws/simulation
```

## API

The backend exposes both REST and WebSocket interfaces.

**WebSocket** -- `ws://localhost:4000/ws/simulation`
- Server broadcasts simulation state at 60Hz
- Client sends player input and voice commands

**REST endpoints:**
- `GET  /api/health` -- Health check
- `GET  /api/simulation/layout` -- Lane definitions and scene metadata
- `GET  /api/simulation/state` -- Current simulation snapshot
- `POST /api/simulation/mission` -- Update mission state
- `POST /api/simulation/player` -- Send player input
- `POST /api/simulation/traffic/reset` -- Reset NPC traffic
- `POST /api/voice/transcribe` -- Transcribe audio to text
- `POST /api/voice/command` -- Parse and execute a voice command
- `POST /api/voice/synthesize` -- Synthesize text to speech audio

## License

TBD
