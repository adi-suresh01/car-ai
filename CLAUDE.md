# VoiceDrive Simulator - Architecture & Build Plan

## Project Vision

VoiceDrive is a **real-time driving simulator** with voice control and multi-agent reinforcement learning. The user sits in a **driver's-seat POV** (like driving a Tesla or Waymo) and uses **voice commands** to control their car in real time. Multiple AI-driven cars share the road, each running its own RL policy. It should feel like a polished racing/driving game, not a tech demo.

### Core Experience
- First-person cockpit view with realistic 3D car models, environment, and lighting
- Voice commands: "cruise 65", "lane left", "overtake", "take exit 3"
- Multiple RL-driven NPC vehicles that behave like real autonomous cars
- Real-time physics at 60Hz with responsive, game-quality feel
- Dashboard HUD with speed, gear, mission status, and CarPlay-style display

## Technology Stack

### Frontend
- **React 19** + **TypeScript** + **Vite**
- **Three.js** via `@react-three/fiber` and `@react-three/drei`
- **GLTF/GLB 3D models** for all vehicles (no primitive box geometry)
- **HDRI environment maps** for realistic lighting and reflections
- **PBR materials** (metalness, roughness, normal maps) on all surfaces
- **Zustand** for state management
- **ONNX Runtime Web** for browser-side RL policy inference
- **Web Audio API** + **WebSocket** for streaming voice (low-latency STT)

### Backend
- **Rust** with **Actix-Web** for the simulation server
- **60Hz physics tick** (16.6ms) using a high-precision game loop
- **WebSocket** server for real-time state sync (replaces HTTP polling)
- **Serde** for serialization, **tokio** for async runtime
- Physics: bicycle model, collision detection, traffic behavior
- Voice routing: proxy to ElevenLabs STT/TTS APIs
- Mission management: voice intent -> mission state updates

### Reinforcement Learning
- **Python** training stack: `stable-baselines3`, `gymnasium`, `torch`
- **PPO** algorithm with vectorized environments
- **ONNX export** for trained policies -> browser inference
- Multi-agent: each NPC runs its own policy variant
- Environment mirrors the Rust physics exactly

### External Services
- **ElevenLabs**: STT (streaming WebSocket) + TTS (acknowledgments)

---

## Project Structure

```
car-ai/
├── CLAUDE.md                          # THIS FILE - master architecture
├── apps/
│   ├── backend/                       # Rust Actix-Web simulation server
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs                # Server entry, Actix-Web setup
│   │       ├── config.rs              # Environment config
│   │       ├── physics/
│   │       │   ├── mod.rs
│   │       │   ├── vehicle.rs         # Bicycle model, vehicle dynamics
│   │       │   ├── collision.rs       # AABB collision detection
│   │       │   └── world.rs           # World state, 60Hz tick loop
│   │       ├── traffic/
│   │       │   ├── mod.rs
│   │       │   ├── manager.rs         # NPC spawning, despawning, behavior
│   │       │   └── profiles.rs        # Lane profiles, speed distributions
│   │       ├── mission/
│   │       │   ├── mod.rs
│   │       │   ├── state.rs           # Mission state machine
│   │       │   └── planner.rs         # Lane change planning, safety checks
│   │       ├── voice/
│   │       │   ├── mod.rs
│   │       │   ├── routes.rs          # Voice API endpoints
│   │       │   ├── intent.rs          # Grammar-based intent parser
│   │       │   └── elevenlabs.rs      # ElevenLabs STT/TTS client
│   │       ├── rl/
│   │       │   ├── mod.rs
│   │       │   ├── environment.rs     # Gym-compatible RL environment
│   │       │   ├── observation.rs     # Observation space builder
│   │       │   ├── reward.rs          # Reward function
│   │       │   └── episode.rs         # Episode generation
│   │       ├── api/
│   │       │   ├── mod.rs
│   │       │   ├── simulation.rs      # Simulation REST + WebSocket endpoints
│   │       │   ├── voice.rs           # Voice REST endpoints
│   │       │   └── types.rs           # Shared API types (serde)
│   │       └── ws/
│   │           ├── mod.rs
│   │           └── session.rs         # WebSocket session handler
│   │
│   ├── frontend/                      # React + Three.js + Vite
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── models/               # GLTF/GLB 3D car models
│   │   │   │   ├── sedan.glb
│   │   │   │   ├── suv.glb
│   │   │   │   ├── truck.glb
│   │   │   │   ├── sports-car.glb
│   │   │   │   └── player-cockpit.glb
│   │   │   ├── hdri/                  # Environment maps
│   │   │   │   └── highway-sunset.hdr
│   │   │   ├── textures/             # Road, ground, material textures
│   │   │   │   ├── asphalt-diffuse.jpg
│   │   │   │   ├── asphalt-normal.jpg
│   │   │   │   ├── asphalt-roughness.jpg
│   │   │   │   └── guardrail-metal.jpg
│   │   │   └── rl/                    # ONNX policy weights
│   │   │       └── ppo-highway.onnx
│   │   └── src/
│   │       ├── main.tsx               # App entry
│   │       ├── App.tsx                # Root layout
│   │       ├── components/
│   │       │   ├── HUD/
│   │       │   │   ├── Speedometer.tsx
│   │       │   │   ├── GearIndicator.tsx
│   │       │   │   ├── MissionStatus.tsx
│   │       │   │   └── VoiceIndicator.tsx
│   │       │   ├── Dashboard/
│   │       │   │   ├── CarPlayDisplay.tsx
│   │       │   │   └── DashboardConsole.tsx
│   │       │   ├── Voice/
│   │       │   │   ├── VoiceListener.tsx
│   │       │   │   └── VoiceDebugPanel.tsx
│   │       │   └── Settings/
│   │       │       └── SettingsPanel.tsx
│   │       ├── scene/
│   │       │   ├── DriverView.tsx         # First-person 3D cockpit scene
│   │       │   ├── TopDownView.tsx        # Bird's eye tactical view
│   │       │   ├── Road.tsx               # Road with PBR textures
│   │       │   ├── Environment.tsx        # HDRI sky, fog, lighting
│   │       │   ├── PlayerCar.tsx          # Cockpit 3D model (GLTF)
│   │       │   ├── TrafficVehicle.tsx     # NPC car GLTF model + instancing
│   │       │   ├── Scenery.tsx            # Trees, barriers, signs
│   │       │   └── PostProcessing.tsx     # Bloom, vignette, tone mapping
│   │       ├── state/
│   │       │   ├── simulationStore.ts     # Zustand store
│   │       │   └── simulationLoop.ts      # RAF game loop + WebSocket sync
│   │       ├── controllers/
│   │       │   ├── voiceCapture.ts        # Mic capture + streaming STT
│   │       │   ├── autopilot.ts           # RL policy runner (ONNX)
│   │       │   └── input.ts              # Keyboard/gamepad input
│   │       ├── services/
│   │       │   ├── api.ts                # REST API client
│   │       │   └── websocket.ts          # WebSocket client
│   │       ├── models/
│   │       │   └── types.ts              # Shared TypeScript types
│   │       └── styles/
│   │           ├── index.css
│   │           ├── hud.css
│   │           └── dashboard.css
│   │
│   └── training/                      # Python RL training
│       ├── pyproject.toml
│       ├── src/car_ai_rl/
│       │   ├── __init__.py
│       │   ├── env.py                 # Gymnasium environment
│       │   ├── observation.py         # Observation space definition
│       │   ├── reward.py              # Reward function (mirrors Rust)
│       │   └── multi_agent.py         # Multi-agent wrapper
│       ├── scripts/
│       │   ├── train_ppo.py           # PPO training with SB3
│       │   └── export_onnx.py         # Export to ONNX for browser
│       └── configs/
│           └── default.yaml           # Training hyperparameters
│
├── data/
│   └── scenarios/
│       └── default.json               # Default scenario config
│
└── .claude/
    └── agents/                        # Agent instruction files
```

---

## Shared API Contracts

All agents MUST use these exact types and endpoints. This is the integration contract.

### WebSocket Protocol (Primary - Real-time)

Connection: `ws://localhost:4000/ws/simulation`

**Server -> Client messages (60Hz):**
```json
{
  "type": "state",
  "timestamp": 1709500000000,
  "player": {
    "laneIndex": 2,
    "lateralOffset": 0.15,
    "speedMph": 65.2,
    "speedMps": 29.16,
    "steerAngleDeg": -1.2,
    "headingRad": -0.02,
    "positionZ": 1240.5,
    "gear": 5
  },
  "vehicles": [
    {
      "id": "npc-001",
      "type": "sedan",
      "laneIndex": 1,
      "speedMph": 60.0,
      "speedMps": 26.82,
      "position": [-3.6, 0, 1180.0],
      "heading": [0, 0, 1]
    }
  ],
  "mission": {
    "mode": "cruise",
    "targetLaneIndex": 2,
    "cruiseTargetSpeedMph": 65,
    "cruiseGapMeters": 32,
    "returnLaneIndex": null,
    "laneChangeDirection": null,
    "source": "voice",
    "updatedAt": 1709500000000
  },
  "collision": false
}
```

**Client -> Server messages:**
```json
{
  "type": "player_input",
  "steering": 0.0,
  "throttle": 0.3,
  "brake": 0.0
}
```

```json
{
  "type": "voice_command",
  "utterance": "cruise control 65 mph"
}
```

### REST Endpoints

```
GET  /api/health                    -> { "status": "ok" }
GET  /api/simulation/layout         -> SimulationLayout
GET  /api/simulation/state          -> SimulationSnapshot
POST /api/simulation/mission        -> MissionState (body: MissionUpdate)
POST /api/simulation/traffic/reset  -> { "ok": true }
POST /api/simulation/player         -> PlayerSnapshot (body: PlayerInput)

POST /api/voice/transcribe          -> { "text": "..." } (body: audio blob)
POST /api/voice/command             -> MissionState (body: { "utterance": "..." })
POST /api/voice/synthesize          -> { "audio": "base64..." } (body: { "text": "..." })
```

### Core Data Types

```typescript
// Vehicle types
type VehicleType = "sedan" | "suv" | "truck" | "sports-car" | "motorcycle";

// Mission modes
type MissionMode = "hold" | "cruise" | "lane_change" | "overtake";

// Mission state
interface MissionState {
  mode: MissionMode;
  targetLaneIndex: number;
  cruiseTargetSpeedMph: number;
  cruiseGapMeters: number;
  returnLaneIndex: number | null;
  laneChangeDirection: "left" | "right" | null;
  source: "voice" | "autopilot" | "manual" | "system";
  updatedAt: number;
}

// Player state
interface PlayerState {
  laneIndex: number;
  lateralOffset: number;
  speedMph: number;
  speedMps: number;
  steerAngleDeg: number;
  headingRad: number;
  positionZ: number;
  gear: number;
}

// NPC vehicle
interface VehicleState {
  id: string;
  type: VehicleType;
  laneIndex: number;
  speedMph: number;
  speedMps: number;
  position: [number, number, number];
  heading: [number, number, number];
}

// Simulation layout
interface SimulationLayout {
  lanes: LaneDefinition[];
  sceneName: string;
  laneCenters: number[];
}

interface LaneDefinition {
  index: number;
  type: "travel" | "exit" | "shoulder";
  speedLimitMph: number;
  description: string;
}

// RL observation (12-dim)
interface RLObservation {
  lanePosition: number;
  lateralOffset: number;
  speed: number;
  targetSpeed: number;
  gapAhead: number;
  gapBehind: number;
  relSpeedAhead: number;
  relSpeedBehind: number;
  missionMode: number;
  targetLane: number;
  laneChangeDir: number;
  crossLaneGap: number;
}

// RL action (3-dim continuous)
interface RLAction {
  throttle: number;   // [0, 1]
  brake: number;      // [0, 1]
  laneRequest: number; // [-1, 1]
}
```

### Physics Constants (Shared between Rust backend and frontend prediction)

```
LANE_WIDTH_METERS     = 3.6
WHEELBASE_METERS      = 2.8
MAX_SPEED_MPH         = 120
MAX_STEER_DEG         = 38
STEER_RATE_DEG_PER_S  = 140
PHYSICS_HZ            = 60
PHYSICS_DT            = 0.01667
ROLLING_RESIST_MPS2   = 0.15
AERO_DRAG_COEFF       = 0.0032
BRAKE_RATE_MPH_PER_S  = 90
```

---

## Agent Work Assignments

### Backend Systems Engineer (Rust)

**Priority: Build first - frontend depends on this.**

Build the complete Rust backend in `apps/backend/`:

1. **Project scaffolding**: `cargo init`, Cargo.toml with actix-web, actix-ws, serde, serde_json, tokio, rand, dotenv
2. **Physics engine** (`src/physics/`):
   - Bicycle model vehicle dynamics at 60Hz
   - AABB collision detection between all vehicles
   - World state holding player + all NPC vehicles
   - Use the physics constants defined above exactly
3. **Traffic system** (`src/traffic/`):
   - NPC vehicle spawning with configurable density
   - Behavior profiles: steady, assertive, cautious
   - Lane-aware movement, speed targets per lane
   - Despawn at distance > 1200m, respawn at -320m
4. **Mission system** (`src/mission/`):
   - State machine: hold -> cruise -> lane_change -> overtake
   - Voice command -> mission update mapping
   - Lane change safety validation (gap checking)
5. **WebSocket server** (`src/ws/`):
   - Real-time state broadcast at 60Hz to connected clients
   - Accept player input messages
   - Accept voice command messages
6. **REST API** (`src/api/`):
   - All endpoints listed in the API contracts above
   - JSON serialization with serde
7. **Voice routing** (`src/voice/`):
   - Grammar-based intent parser for voice command interpretation
   - Proxy to ElevenLabs for STT/TTS
8. **RL environment** (`src/rl/`):
   - Gymnasium-compatible step/reset interface
   - 12-dim observation builder
   - Reward function: progress, lane keeping, comfort, collision penalty
   - Episode generation for training data

**Server must start with:** `cargo run` on port 4000.
**Test with:** `cargo test`

### Frontend Engineer (React + Three.js)

**Priority: Can start in parallel, initially with mock data, then connect to backend WebSocket.**

Build the complete frontend in `apps/frontend/`:

1. **Project scaffolding**: Vite + React + TypeScript, install three, @react-three/fiber, @react-three/drei, zustand, onnxruntime-web
2. **3D Scene - Driver View** (`src/scene/DriverView.tsx`):
   - Load GLTF cockpit model for player car interior
   - First-person camera positioned at driver's eye level
   - Camera sway/bob based on speed for immersion
   - FOV increases with speed (60 base, +6 at top speed)
   - Steering roll effect on camera
3. **3D Scene - Environment** (`src/scene/`):
   - HDRI environment map for sky and reflections
   - PBR road surface with diffuse, normal, and roughness textures
   - Lane markings with emissive glow
   - Guard rails, scenery (trees/barriers), distant backdrop
   - Fog for depth perception
4. **3D Scene - Vehicles** (`src/scene/TrafficVehicle.tsx`):
   - Load GLTF models for each vehicle type (sedan, suv, truck, sports-car)
   - Use instanced meshes for performance with many NPCs
   - Headlights (emissive front), taillights (emissive rear)
   - Position relative to player (player is always at origin)
5. **Post-processing** (`src/scene/PostProcessing.tsx`):
   - EffectComposer with RenderPass
   - UnrealBloomPass for lane marking glow and headlights
   - Vignette shader for cockpit depth
   - ACES filmic tone mapping
6. **HUD Overlay** (`src/components/HUD/`):
   - Speedometer (digital, large font)
   - Gear indicator
   - Mission status display
   - Voice activity indicator (mic icon, waveform)
7. **Dashboard** (`src/components/Dashboard/`):
   - CarPlay-style display (navigation, media, climate)
   - Voice command history
8. **State management** (`src/state/`):
   - Zustand store matching the data types above
   - WebSocket client that receives 60Hz state updates
   - Client-side prediction between server ticks
   - Smooth interpolation for NPC positions
9. **Voice capture** (`src/controllers/voiceCapture.ts`):
   - WebSocket streaming to ElevenLabs for low-latency STT
   - VAD (voice activity detection) to skip silence
   - Keyword gating for driving commands
   - Send transcribed commands via WebSocket to backend
10. **RL policy runner** (`src/controllers/autopilot.ts`):
    - Load ONNX policy weights
    - Run inference on each frame to produce actions
    - Apply actions through the mission/control system

**For 3D models**: Generate placeholder GLTF models using Three.js primitives wrapped in proper GLTF structure, or download free models from sources like Kenney.nl or poly.pizza. The models should have proper PBR materials, not flat colored boxes.

**Dev server:** `npm run dev` on port 5173, proxy `/api` and `/ws` to backend port 4000.

### Code Review & Tester

**Priority: Activates after backend or frontend completes a major component.**

1. Review code submitted by backend or frontend agents
2. Write test cases covering:
   - Unit tests for physics calculations
   - Integration tests for API endpoints
   - WebSocket connection and message format tests
   - Frontend component render tests
3. Run tests and report pass/fail
4. If failures found, create detailed bug reports
5. Coordinate with debug-surgeon for fixes
6. Re-test until all pass, then signal the originating agent to continue

### Debug Surgeon

**Priority: Activates when code-review-tester finds failures.**

1. Read the test failure reports
2. Make minimal, precise fixes
3. Do not change architecture or add features
4. Signal code-review-tester to re-run tests
5. Iterate until green

---

## Build Order & Dependencies

```
Phase 1 (Parallel):
  Backend: Scaffold + Physics + Traffic + Mission + REST API
  Frontend: Scaffold + 3D Scene + Environment + Road + Vehicles + HUD

Phase 2 (Integration):
  Backend: WebSocket server live
  Frontend: Connect WebSocket, replace mock data with real state

Phase 3 (Voice):
  Backend: Voice routing endpoints
  Frontend: Voice capture + streaming STT

Phase 4 (RL):
  Training: Python env + PPO training + ONNX export
  Frontend: ONNX policy runner
  Backend: RL environment for episode generation

Phase 5 (Polish):
  Multi-agent NPC policies
  Scenario system
  Performance optimization
```

---

## Environment Variables

Backend `.env`:
```
PORT=4000
RUST_LOG=info
XI_API_KEY=<elevenlabs-api-key>
XI_WEBHOOK_SECRET=<elevenlabs-webhook-secret>
```

Frontend `.env`:
```
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000/ws/simulation
```

---

## Quality Standards

- No placeholder box geometry for vehicles. Use proper 3D models or generate quality procedural geometry.
- Physics must run at 60Hz minimum. No setTimeout-based loops.
- WebSocket for all real-time data. REST only for initial layout fetch and non-time-critical operations.
- All code must compile/build without errors before submission for review.
- No hardcoded magic numbers - use the shared physics constants.
- Consistent code style: Rust uses rustfmt defaults, TypeScript uses the project ESLint config.
