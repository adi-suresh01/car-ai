import type {
  SimulationLayout,
  MissionState,
  ScenarioDefinition,
  RouteGeometry,
  RouteSummary,
  TurnDirection,
} from "../models/types";

const API_BASE = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API ${path} returned ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchHealth(): Promise<{ status: string }> {
  return request("/api/health");
}

export async function fetchLayout(): Promise<SimulationLayout> {
  return request("/api/simulation/layout");
}

export async function updateMission(
  update: Partial<MissionState>
): Promise<MissionState> {
  return request("/api/simulation/mission", {
    method: "POST",
    body: JSON.stringify(update),
  });
}

export async function resetTraffic(): Promise<{ ok: boolean }> {
  return request("/api/simulation/traffic/reset", { method: "POST" });
}

export async function sendVoiceCommand(
  utterance: string
): Promise<MissionState> {
  return request("/api/voice/command", {
    method: "POST",
    body: JSON.stringify({ utterance }),
  });
}

export async function fetchScenarios(): Promise<ScenarioDefinition[]> {
  return request("/api/scenarios");
}

export async function loadScenario(
  scenarioName: string
): Promise<{ ok: boolean }> {
  return request("/api/scenarios/load", {
    method: "POST",
    body: JSON.stringify({ name: scenarioName }),
  });
}

export async function transcribeAudio(
  audioBlob: Blob
): Promise<{ text: string }> {
  const formData = new FormData();
  formData.append("audio", audioBlob);

  const url = `${API_BASE}/api/voice/transcribe`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status}`);
  }

  return response.json();
}

// Backend response types (different shapes from frontend types)
interface BackendRouteSummary {
  origin: string;
  destination: string;
  distanceKm: number;
  durationMin: number;
  waypointCount: number;
  roadSplineLengthM: number;
  numLanes: number;
}

interface BackendSplinePoint {
  x: number;
  z: number;
  s: number;
  heading: number;
  curvature: number;
}

interface BackendRoadSpline {
  controlPoints: Array<[number, number]>;
  sampledPoints: BackendSplinePoint[];
  totalLength: number;
  laneMetadata: Array<{
    laneCount: number;
    speedLimitMps: number | null;
    roadWidthM: number | null;
  }>;
  numLanes: number;
}

interface BackendTurnInstruction {
  distanceM: number;
  durationS: number;
  instruction: string;
  modifier: string | null;
  maneuverType: string;
  name: string;
  position: [number, number];
}

export async function planRoute(
  origin: string,
  destination: string
): Promise<RouteSummary> {
  const raw = await request<BackendRouteSummary>("/api/route/plan", {
    method: "POST",
    body: JSON.stringify({ origin, destination }),
  });

  return {
    distance: raw.roadSplineLengthM,
    duration: raw.durationMin * 60,
    turnCount: 0,
    previewPolyline: [],
  };
}

export async function getRouteGeometry(): Promise<RouteGeometry> {
  const raw = await request<BackendRoadSpline>("/api/route/geometry");

  // The backend's sampledPoints have the full {x, z, s, heading, curvature} shape
  // that the frontend needs as controlPoints for its spline sampling.
  const controlPoints = raw.sampledPoints.map((sp) => ({
    x: sp.x,
    z: sp.z,
    heading: sp.heading,
    curvature: sp.curvature,
    s: sp.s,
  }));

  // Extract speed limits from lane metadata
  const speedLimits: Array<{ s: number; speedMph: number }> = [];
  if (raw.laneMetadata.length > 0 && raw.laneMetadata[0].speedLimitMps != null) {
    speedLimits.push({
      s: 0,
      speedMph: raw.laneMetadata[0].speedLimitMps * 2.23694,
    });
  }

  return {
    controlPoints,
    laneCount: raw.numLanes,
    laneWidth: 3.6,
    totalLength: raw.totalLength,
    speedLimits,
  };
}

export async function getRouteDirections(): Promise<TurnDirection[]> {
  const raw = await request<BackendTurnInstruction[]>("/api/route/directions");

  let cumulativeS = 0;
  return raw.map((step) => {
    cumulativeS += step.distanceM;

    // Map OSRM maneuver types to our TurnType
    let turnType: TurnDirection["turnType"] = "straight";
    const mod = step.modifier ?? "";
    const mType = step.maneuverType;

    if (mType === "arrive") {
      turnType = "arrive";
    } else if (mType === "turn" || mType === "end of road" || mType === "fork") {
      if (mod.includes("sharp") && mod.includes("left")) turnType = "sharp_left";
      else if (mod.includes("sharp") && mod.includes("right")) turnType = "sharp_right";
      else if (mod.includes("slight") && mod.includes("left")) turnType = "slight_left";
      else if (mod.includes("slight") && mod.includes("right")) turnType = "slight_right";
      else if (mod.includes("left")) turnType = "left";
      else if (mod.includes("right")) turnType = "right";
    } else if (mType === "new name" || mType === "continue") {
      if (mod.includes("left")) turnType = "slight_left";
      else if (mod.includes("right")) turnType = "slight_right";
    }

    return {
      instruction: step.instruction || `${mType} on ${step.name}`.trim(),
      distanceMeters: step.distanceM,
      s: cumulativeS,
      turnType,
    };
  });
}
