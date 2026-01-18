# Voice Commands (Backend)

This document lists the currently supported backend voice commands and the missions they trigger.

## Mission commands

- "Cruise" / "Cruise control" / "Cruise control 65" / "Cruise 65 mph"
  - Sets mission mode to `cruise` with target speed and gap.
- "Cruise control 65 mph with 3 car lengths"
  - Sets cruise speed and gap (cars converted to meters).
- "Move left" / "Left lane" / "Shift left"
  - Sets mission mode to `lane_change` and target lane (left).
- "Move right" / "Right lane" / "Shift right"
  - Sets mission mode to `lane_change` and target lane (right).
- "Overtake"
  - Sets mission mode to `overtake` and plans a return lane if available.

## Informational commands

- "Any cops ahead?" / "Police nearby?"
  - Returns summary only (no mission update) via voice status.

## Endpoints

- `POST /api/voice/transcriptions` — ElevenLabs STT proxy.
- `POST /api/voice/synthesize` — ElevenLabs TTS proxy.
- `POST /api/voice/intent` — Fireworks intent parsing.
- `POST /api/voice/mission` — Applies voice-derived mission updates.
