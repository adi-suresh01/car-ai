# Voice Control Integration Plan

This note spells out how ElevenLabs powers the real-time voice loop and where Fireworks fits.

## 1. ElevenLabs responsibilities
- **Speech-to-text (STT)**: low-latency transcription of the driver’s microphone stream.
- **Conversational agent**: ElevenLabs “Agent” hosts turn-taking and function-calling logic.
- **Text-to-speech (TTS)**: spoken acknowledgements (“Cruise control set to 75 mph, gap 3 cars”).

Everything happens over one WebSocket session—no webhooks required.

### Agent function schema
Expose a single function for cruise/tactical control:

```json
{
  "name": "set_mission",
  "description": "Update the driving mission targets",
  "parameters": {
    "type": "object",
    "properties": {
      "speed_mph": { "type": "number" },
      "gap_cars": { "type": "number" },
      "target_lane": { "type": ["integer", "null"] },
      "note": { "type": "string" }
    },
    "required": ["speed_mph"]
  }
}
```

When the agent calls `set_mission`, forward it to the backend mission endpoint (invokes `DrivingEnvironment.setMission`).

### Implementation steps
1. **Create API key** (already in `.env.example`).
2. **Define agent** in the ElevenLabs dashboard pointing to the schema above.
3. **Frontend**: open the WebSocket, stream mic audio, forward function calls to the backend, and play the TTS stream.
4. **Backend**: use the new endpoints
   - `POST /api/voice/mission` for ElevenLabs Agents (voice + optional intent metadata).
   - `POST /api/simulation/mission` for internal/UI overrides or scripted tests.

### Supported voice commands (MVP)
- **Cruise control** – phrases like “cruise control”, “set cruise control to 65”, “cruise control speed 65 and 3 cars”.
  - Defaults: speed = current speed, gap = 2 car lengths (≈9.2 m).
  - Cruise disengages when the user pushes the stick up (throttle) or down (brake) — front-end logic will handle this input.
- **Lane change** – “move to left lane”, “shift right lane”, “go to rightmost lane”. The simulator checks lane availability and sets `mode = lane_change` with the desired target lane.
- **Overtake** – “overtake”, “overtake on the right”. The mission will request an adjacent lane (prefers left unless otherwise specified) and remember the return lane so the controller can merge back once clear.

Additional commands can be appended by extending `parseVoiceMission` in `apps/backend/src/utils/voiceCommandParser.ts`.

## 2. Fireworks responsibilities
- **Intent parsing (optional)**: If agents need richer reasoning, call a Fireworks hosted LLM inside the ElevenLabs function to normalise the command. Otherwise, stick to prompt engineering on the ElevenLabs agent itself.
- **RL training/evals**: Fireworks RFT trains the custom cruise-and-lane controller; evaluators run regression tests.

Keep both API keys (`ELEVENLABS_API_KEY`, `FIREWORKS_API_KEY`) in `.env`. The simulator now has mission-aware rewards, so once the voice function writes into the mission state, you can immediately generate episodes and train the policy.
