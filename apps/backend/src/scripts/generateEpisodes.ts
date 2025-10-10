import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import { generateEpisodeBatch, type MissionOverrides } from "../rl/episodeGenerator";
import type { EpisodeMetadata } from "../rl/episodeTypes";

interface CliOptions {
  episodes: number;
  output: string;
  speedMph?: number;
  gapMeters?: number;
  gapCars?: number;
  targetLane?: number | null;
  command: string;
  description?: string;
}

const DEFAULTS: CliOptions = {
  episodes: 20,
  output: "../../data/fireworks/episodes.jsonl",
  speedMph: 68,
  gapMeters: 30,
  command: "cruise_control",
  description: "Default cruise-control training seed",
};

const CAR_LENGTH_METERS = 4.6;

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = { ...DEFAULTS };
  const requireValue = (flag: string, value: string | undefined) => {
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${flag}`);
    }
    return value;
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    switch (key) {
      case "episodes":
        options.episodes = Number.parseInt(requireValue(key, args[i + 1]), 10);
        i += 1;
        break;
      case "output":
        options.output = requireValue(key, args[i + 1]);
        i += 1;
        break;
      case "speed":
        options.speedMph = Number.parseFloat(requireValue(key, args[i + 1]));
        i += 1;
        break;
      case "gap-meters":
        options.gapMeters = Number.parseFloat(requireValue(key, args[i + 1]));
        i += 1;
        break;
      case "gap-cars":
        options.gapCars = Number.parseFloat(requireValue(key, args[i + 1]));
        i += 1;
        break;
      case "lane": {
        const laneValue = requireValue(key, args[i + 1]);
        options.targetLane =
          laneValue === "null" || laneValue === "none"
            ? null
            : Number.parseInt(laneValue, 10);
        i += 1;
        break;
      }
      case "command":
        options.command = requireValue(key, args[i + 1]);
        i += 1;
        break;
      case "description":
        options.description = requireValue(key, args[i + 1]);
        i += 1;
        break;
      default:
        break;
    }
  }

  if (options.gapCars !== undefined) {
    options.gapMeters = options.gapCars * CAR_LENGTH_METERS;
  }

  return options;
};

const writeEpisodes = async (outputPath: string, lines: string[]) => {
  const resolved = resolve(outputPath);
  await fs.mkdir(dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${lines.join("\n")}\n`, "utf8");
};

const main = async () => {
  const options = parseArgs();
  const mission: MissionOverrides = {};
  if (options.targetLane !== undefined) {
    mission.targetLaneIndex = options.targetLane;
  }
  if (options.speedMph !== undefined) {
    mission.cruiseTargetSpeedMph = options.speedMph;
  }
  if (options.gapMeters !== undefined) {
    mission.cruiseGapMeters = options.gapMeters;
  }

  const metadata: EpisodeMetadata = {
    sceneId: "pending",
    command: options.command,
  };
  if (options.description !== undefined) {
    metadata.description = options.description;
  }

  const episodes = generateEpisodeBatch({
    episodeCount: options.episodes,
    mission,
    metadata,
  });

  const lines = episodes.map((episode) => JSON.stringify(episode));
  await writeEpisodes(options.output, lines);
  // eslint-disable-next-line no-console
  console.log(
    `Generated ${episodes.length} episodes to ${resolve(options.output)} (command=${options.command})`,
  );
};

if (require.main === module) {
  void main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Episode generation failed", error);
    process.exitCode = 1;
  });
}
