import { appendFile, mkdir } from "fs/promises";
import path from "path";

interface IntentLogEntry {
  timestamp: string;
  utterance: string;
  requestPayload: unknown;
  missionBefore?: unknown;
  missionAfter?: unknown;
}

const OUTPUT_DIR = path.join(process.cwd(), "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "voice_intents.jsonl");

export const intentLogger = {
  async log(entry: IntentLogEntry) {
    try {
      await mkdir(OUTPUT_DIR, { recursive: true });
      const line = JSON.stringify(entry);
      await appendFile(OUTPUT_FILE, `${line}\n`, { encoding: "utf8" });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to append intent log", error);
    }
  },
};
