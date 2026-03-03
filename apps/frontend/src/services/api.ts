import type { SimulationLayout, MissionState, ScenarioDefinition } from "../models/types";

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
