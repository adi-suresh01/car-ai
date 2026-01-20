import assert from "assert";
import { sanitizeTranscript } from "../utils/voiceTranscriptSanitizer";

const mockResponses = [
  { text: "(rock music)" },
  { text: "Привет как дела" },
  { text: "こんにちは" },
];

mockResponses.forEach((response) => {
  const sanitized = sanitizeTranscript(response.text);
  assert.equal(sanitized.rejected, true);
});

const englishResponse = { text: "Cruise at 55 mph" };
const englishSanitized = sanitizeTranscript(englishResponse.text);
assert.equal(englishSanitized.rejected, false);

console.log("voice transcription integration test passed");
