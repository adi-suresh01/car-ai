import { useSimulationStore } from "../state/simulationStore";
import type { MissionState } from "../models/types";

/**
 * Parse a voice utterance locally and update the mission store.
 * This provides offline voice command support when the backend is unavailable.
 * Returns true if the utterance was understood.
 */
export function parseAndApplyVoiceCommand(utterance: string): boolean {
  const lower = utterance.toLowerCase().replace(/[^a-z0-9 -]/g, " ").trim();
  const tokens = lower.split(/\s+/);
  const store = useSimulationStore.getState();
  const mission = store.mission;

  // Speed up
  if (lower.includes("speed up") || lower.includes("faster") || lower.includes("accelerate")) {
    const delta = extractNumber(tokens) ?? 5;
    const newSpeed = Math.min(120, mission.cruiseTargetSpeedMph + delta);
    useSimulationStore.setState({
      mission: { ...mission, mode: "cruise", cruiseTargetSpeedMph: newSpeed, source: "voice", updatedAt: Date.now() },
    });
    return true;
  }

  // Slow down
  if (lower.includes("slow down") || lower.includes("slower") || lower.includes("decelerate")) {
    const delta = extractNumber(tokens) ?? 5;
    const newSpeed = Math.max(0, mission.cruiseTargetSpeedMph - delta);
    useSimulationStore.setState({
      mission: { ...mission, mode: "cruise", cruiseTargetSpeedMph: newSpeed, source: "voice", updatedAt: Date.now() },
    });
    return true;
  }

  // Cruise speed
  const cruiseSpeed = extractCruiseSpeed(tokens, lower);
  if (cruiseSpeed !== null) {
    useSimulationStore.setState({
      mission: { ...mission, mode: "cruise", cruiseTargetSpeedMph: cruiseSpeed, source: "voice", updatedAt: Date.now() },
    });
    return true;
  }

  // Lane left
  if (lower.includes("lane left") || lower.includes("left lane") || lower.includes("move left") || lower.includes("go left") || lower.includes("merge left")) {
    const targetLane = Math.max(0, store.player.laneIndex - 1);
    if (targetLane !== store.player.laneIndex) {
      useSimulationStore.setState({
        mission: { ...mission, mode: "lane_change", targetLaneIndex: targetLane, laneChangeDirection: "left", source: "voice", updatedAt: Date.now() },
      });
    }
    return true;
  }

  // Lane right
  if (lower.includes("lane right") || lower.includes("right lane") || lower.includes("move right") || lower.includes("go right") || lower.includes("merge right")) {
    const laneCount = store.routeGeometry?.laneCount ?? 4;
    const targetLane = Math.min(laneCount - 1, store.player.laneIndex + 1);
    if (targetLane !== store.player.laneIndex) {
      useSimulationStore.setState({
        mission: { ...mission, mode: "lane_change", targetLaneIndex: targetLane, laneChangeDirection: "right", source: "voice", updatedAt: Date.now() },
      });
    }
    return true;
  }

  // Overtake
  if (lower.includes("overtake") || (lower.includes("pass") && !lower.includes("passenger"))) {
    const targetLane = Math.max(0, store.player.laneIndex - 1);
    useSimulationStore.setState({
      mission: {
        ...mission,
        mode: "overtake",
        targetLaneIndex: targetLane,
        returnLaneIndex: store.player.laneIndex,
        laneChangeDirection: "left",
        source: "voice",
        updatedAt: Date.now(),
      },
    });
    return true;
  }

  // Stop / hold
  if (lower.includes("stop") || lower.includes("brake") || lower.includes("hold") || lower.includes("cancel")) {
    useSimulationStore.setState({
      mission: { ...mission, mode: "hold", source: "voice", updatedAt: Date.now() },
    });
    return true;
  }

  // Resume
  if (lower.includes("resume") || lower.includes("continue") || lower.includes("go ahead")) {
    useSimulationStore.setState({
      mission: { ...mission, mode: "cruise", source: "voice", updatedAt: Date.now() },
    });
    return true;
  }

  return false;
}

function extractNumber(tokens: string[]): number | null {
  for (const token of tokens) {
    const n = parseFloat(token);
    if (!isNaN(n) && n > 0 && n <= 120) return n;
  }

  const wordNumbers: Record<string, number> = {
    five: 5, ten: 10, fifteen: 15, twenty: 20, "twenty-five": 25,
    thirty: 30, "thirty-five": 35, forty: 40, "forty-five": 45,
    fifty: 50, "fifty-five": 55, sixty: 60, "sixty-five": 65,
    seventy: 70, "seventy-five": 75, eighty: 80, "eighty-five": 85,
    ninety: 90, "ninety-five": 95, hundred: 100,
  };

  for (const token of tokens) {
    if (wordNumbers[token] !== undefined) return wordNumbers[token];
  }

  // Compound: "sixty five" → 65
  for (let i = 0; i < tokens.length - 1; i++) {
    const tens = wordNumbers[tokens[i]];
    const ones = wordNumbers[tokens[i + 1]];
    if (tens !== undefined && ones !== undefined && tens >= 20 && tens % 10 === 0 && ones >= 1 && ones <= 9) {
      return tens + ones;
    }
  }

  return null;
}

function extractCruiseSpeed(tokens: string[], lower: string): number | null {
  const strong = tokens.includes("cruise") || tokens.includes("set");
  const weak = tokens.includes("speed") || tokens.includes("drive") || tokens.includes("go");

  if (!strong && !weak) return null;

  // Don't match "speed up" / "go left" etc.
  if (lower.includes("speed up") || lower.includes("go left") || lower.includes("go right") || lower.includes("go ahead")) {
    return null;
  }

  const number = extractNumber(tokens);
  if (strong) return number;
  return number; // weak only matches when number found
}
