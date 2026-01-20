import assert from "assert";
import { sanitizeTranscript } from "../utils/voiceTranscriptSanitizer";
import { matchVoiceCommandGrammar } from "../utils/voiceCommandMatcher";

const sanitizedNoise = sanitizeTranscript("(music)");
assert.equal(sanitizedNoise.rejected, true);
assert.equal(sanitizedNoise.reason, "noise_tag");

const sanitizedEnglish = sanitizeTranscript("Set cruise speed to 55 mph");
assert.equal(sanitizedEnglish.rejected, false);
assert.equal(sanitizedEnglish.isCommandLike, true);

const grammarMatch = matchVoiceCommandGrammar("cruise 65 mph", {
  currentSpeedMph: 60,
  currentLaneIndex: 1,
  laneCount: 3,
});
assert.ok(grammarMatch);
assert.equal(grammarMatch?.update.cruiseTargetSpeedMph, 65);

console.log("voice utils tests passed");
