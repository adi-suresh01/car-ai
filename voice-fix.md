# Voice Fix Notes

## Current issues
- Voice transcription intermittently returns non-English text even when `language=en` is set.
- Transcripts often include ambient sounds, causing spurious voice commands.
- Cruise-control missions update on the backend but the frontend speed behavior does not match.

## Evidence
- Backend logs show STT output such as "(rock music)" and occasional non-English transcripts.
- Mission updates are emitted (e.g., `cruiseTargetSpeedMph: 45`), but the frontend speed does not rise to target.

## Files to review (backend)
- `apps/backend/src/controllers/voiceController.ts` (voice endpoints, mission application, logging)
- `apps/backend/src/services/elevenLabsService.ts` (STT/TTS integration, model selection)
- `apps/backend/src/utils/voiceCommandParser.ts` (number parsing and command mapping)
- `apps/backend/src/routes/voiceRoutes.ts` (voice endpoint routing)
- `apps/backend/src/services/simulationService.ts` (mission state and voiceStatus)
- `apps/backend/src/models/simulation.ts` (voiceStatus + mission schema)
- `apps/backend/src/models/voice.ts` (intent/transcription types)

## Files to review (frontend)
- `apps/frontend/src/controllers/useVoiceCapture.ts` (mic capture, STT upload, command submission)
- `apps/frontend/src/controllers/useVoiceCommand.ts` (typed command flow, mission apply)
- `apps/frontend/src/components/VoiceDebugPanel.tsx` (voice UI + status)
- `apps/frontend/src/state/useSimulationStore.ts` (cruise control logic, physics, mission handling)
- `apps/frontend/src/components/AutopilotController.tsx` (gap-keeping + lane-change safety)
- `apps/frontend/src/state/useSimulationLoop.ts` (snapshot sync cadence)

## Suspected root causes
- STT language drift / noisy environment: no post-filtering of non-command transcripts.
- Voice loop sends every short segment without keyword gating.
- Cruise behavior depends on frontend physics + control loop; drag or throttle logic may prevent acceleration to target.
