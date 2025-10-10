# Traffic Simulation Notes

This document outlines how the multi‑lane traffic model is produced on the backend and how the frontend consumes it for both the driver POV and the tactical overview.

## Backend pipeline (`apps/backend/src/services/simulationService.ts`)

- **Scene & lane profiles**
  - Two California highway scenes are defined (`US‑101`, `CA‑1`); every lane gets a `TrafficLaneProfile`.
  - Profiles drive target speed bands, preferred spacing, spawn rates, and qualitative behaviour (express vs exit lanes).

- **Vehicle state**
  - Each NPC is tracked as `{ id, laneIndex, positionZ, speedMps, targetSpeedMps, type, behavior, lengthMeters, widthMeters }`.
  - Vehicles advance in a 160 ms tick (`setInterval`), applying:
    - Speed relaxation towards target + behaviour bias (`assertive`, `steady`, `cautious`).
    - Spacing constraints—followers tuck in behind leaders with minimum gap enforcement.
    - Despawn/respawn at corridor bounds (`positionZ > 1400` or `-520`).
    - Opportunistic lane changes when the current gap is too short and an adjacent lane offers more headroom. Lane changes retarget speed to the destination profile.

- **Snapshot API**
  - `GET /api/simulation/state` emits:
    ```json
    {
      "timestamp": 173, "sceneId": "california-101",
      "lanes": [TrafficLaneProfile…],
      "player": { ... }        // retained for future telemetry
      "vehicles": [{ id, laneIndex, position: [x,0,z], speedMps, speedMph, ... }]
    }
    ```
  - `position[0]` already encodes the lane centre so the client can place cars accurately in both cameras.
  - Support endpoints:
    - `POST /api/simulation/traffic/reset` clears NPCs and reseeds based on lane density.
    - `POST /api/simulation/traffic/spawn` inserts a custom vehicle (useful for scripted evals).
    - `POST /api/simulation/player` updates the tracked player state if needed for telemetry.

## RL-ready environment (`apps/backend/src/rl/drivingEnv.ts`)

- Wraps the same traffic generator with a Gym-style API.
- State vector includes lane offset, speed, gaps ahead/behind, and relative velocities.
- Action space is continuous acceleration/brake plus target lane. Reward shaping:
  - Progress (forward velocity)
  - Lane keeping and comfort penalties
  - Rule compliance (speeding / unsafe gap)
  - Large collision penalty with early termination
- This environment is what we’ll connect to Fireworks evaluators or PPO training loops.

## Frontend consumption (`apps/frontend`)

### Store (`src/state/useSimulationStore.ts`)

- Tracks:
  - `player`: local dynamics (lane index, offset, speed, gear, positionZ).
  - `npcVehicles`: the latest server-sourced NPC states.
- `npcVehicles`: authoritative list from backend.
- `player.laneCenter` tracks the current lane's world X for the driver, so cameras can translate the scene without recomputing lane centres per frame.
- `buildVehicleList(player, npcVehicles, laneCenters)` helper composes the render list on demand (components call it inside `useMemo`).
  - `laneCenters`: cached offsets so each lane has a stable X coordinate.
- Tick loop (`useSimulationLoop`):
  - Runs animation-frame updates to integrate player physics.
  - Every second, calls `syncTraffic()` which pulls `/simulation/state` and refreshes `npcVehicles` while leaving the player untouched.
  - Between syncs, each NPC is advanced locally using its current speed so motion stays smooth; the next snapshot corrects any drift.
- Safety guards ensure we never write invalid positions (failing snapshots are ignored and NaNs are dropped before rendering), preventing the “black screen” failure.

### Rendering

- **Driver POV (`views/SimulatorView/DriverCameraView.tsx`)**
- Adds `<TrafficVehiclesBridge>` that builds the render list via `buildVehicleList` and filters out the player before instantiating meshes.
  - Each mesh subtracts the player’s lateral offset and longitudinal position to place cars correctly in the forward view.
- **Tactical overview (`views/SimulatorView/TopDownCameraView.tsx`)**
  - Uses the same vehicle list to drop markers on the orthographic map. Relative coordinates are computed identically so both views stay synchronized.
  - Camera zoom is set to `16` at `y=64` so all five lanes stay in frame.

## Working with the model

1. **Backend**
   - Start with `npm run dev` (backend). Watch logs for “Simulation tick failed”; if that appears, the service has caught an exception in the traffic loop.
   - Hit `/api/simulation/state` to inspect lane profiles and vehicle payloads when debugging.
2. **Frontend**
   - Run `npm run dev` (frontend) and hard refresh (`Cmd/Ctrl+Shift+R`) after CSS or store changes to flush Vite caches.
   - If the canvases go blank, check the DevTools console for NaN positions or missing coordinates—`traffic.md` shows where guards are in place.
3. **RL / Evaluators**
   - Training scripts can import `DrivingEnvironment` directly or run through the REST API.
   - Use the new `npcVehicles` array when exporting rollouts so you separate ego vs. surrounding traffic state cleanly.

Refer back to this file whenever you need to adjust spawning, tweak lane behaviour, or hook the sim into Fireworks/Convex tooling. The headings map directly to the code modules touched in this iteration.
