import { useRef, useEffect, useCallback, useState } from "react";
import { useSimulationStore } from "../../state/simulationStore";
import {
  planRoute,
  getRouteGeometry,
  getRouteDirections,
} from "../../services/api";
import {
  generateMockRouteGeometry,
  generateMockDirections,
  generateMockRouteSummary,
} from "../../scene/roadSpline";

const PRESET_DESTINATIONS = [
  { label: "Santa Cruz Beach Boardwalk", sub: "Highway 17" },
  { label: "Half Moon Bay", sub: "Highway 92" },
  { label: "San Francisco", sub: "I-280" },
  { label: "Monterey", sub: "Highway 1" },
] as const;

const DEFAULT_ORIGIN = "Stanford University, Palo Alto, CA";

type NavTab = "navigate" | "status";

const TURN_ARROWS: Record<string, string> = {
  straight: "^",
  slight_left: "\\",
  slight_right: "/",
  left: "<-",
  right: "->",
  sharp_left: "<<",
  sharp_right: ">>",
  hairpin_left: "<<<",
  hairpin_right: ">>>",
  arrive: "X",
};

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const store = useSimulationStore.getState();
      const summary = store.routeSummary;
      const directions = store.routeDirections;
      const currentIdx = store.currentDirectionIndex;
      const posS = store.playerPositionS;
      const player = store.player;
      const geometry = store.routeGeometry;

      if (!canvas || !ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = "rgba(12, 16, 24, 0.85)";
      ctx.fillRect(0, 0, w, h);

      if (!summary || !summary.previewPolyline || summary.previewPolyline.length < 2) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.font = "11px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No route loaded", w / 2, h / 2);
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const polyline = summary.previewPolyline;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [px, pz] of polyline) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }

      const rangeX = maxX - minX || 1;
      const rangeZ = maxZ - minZ || 1;
      const padding = 20;
      const scaleX = (w - padding * 2) / rangeX;
      const scaleZ = (h - padding * 2) / rangeZ;
      const scale = Math.min(scaleX, scaleZ);

      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      function toScreen(worldX: number, worldZ: number): [number, number] {
        const heading = -(player?.headingRad ?? 0);
        const relX = worldX - centerX;
        const relZ = worldZ - centerZ;

        const rotX = relX * Math.cos(heading) - relZ * Math.sin(heading);
        const rotZ = relX * Math.sin(heading) + relZ * Math.cos(heading);

        return [
          w / 2 + rotX * scale,
          h / 2 - rotZ * scale,
        ];
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < polyline.length; i++) {
        const [sx, sy] = toScreen(polyline[i][0], polyline[i][1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      if (geometry && posS > 0) {
        const totalLen = geometry.totalLength;
        const progressFrac = Math.min(posS / totalLen, 1);
        const progressIdx = Math.floor(progressFrac * (polyline.length - 1));

        ctx.strokeStyle = "#00aaff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= progressIdx && i < polyline.length; i++) {
          const [sx, sy] = toScreen(polyline[i][0], polyline[i][1]);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      if (geometry && geometry.controlPoints.length > 0) {
        const totalLen = geometry.totalLength;
        const progressFrac = Math.min(posS / totalLen, 1);
        const cpIdx = Math.floor(progressFrac * (geometry.controlPoints.length - 1));
        const cp = geometry.controlPoints[Math.min(cpIdx, geometry.controlPoints.length - 1)];

        const [px, py] = toScreen(cp.x, cp.z);

        ctx.fillStyle = "#00aaff";
        ctx.shadowColor = "#00aaff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const headingAngle = cp.heading - (player?.headingRad ?? 0);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-headingAngle);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(4, 4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (directions.length > 0 && currentIdx < directions.length) {
        const nextDir = directions[currentIdx];
        if (nextDir && geometry) {
          const nextFrac = Math.min(nextDir.s / geometry.totalLength, 1);
          const nextPolyIdx = Math.floor(nextFrac * (polyline.length - 1));
          if (nextPolyIdx < polyline.length) {
            const [tx, ty] = toScreen(polyline[nextPolyIdx][0], polyline[nextPolyIdx][1]);
            ctx.fillStyle = "#ffaa00";
            ctx.shadowColor = "#ffaa00";
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(tx, ty, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={248}
      height={160}
      className="carplay-minimap"
    />
  );
}

function AddressPanel({
  onNavigate,
}: {
  onNavigate: (origin: string, destination: string) => void;
}) {
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState("");
  const routeLoading = useSimulationStore((s) => s.routeLoading);

  const handlePreset = useCallback(
    (dest: string) => {
      setDestination(dest);
      onNavigate(origin, dest);
    },
    [origin, onNavigate]
  );

  const handleNavigate = useCallback(() => {
    if (!destination.trim()) return;
    onNavigate(origin, destination);
  }, [origin, destination, onNavigate]);

  return (
    <div className="carplay-address-panel">
      <div className="address-field">
        <label className="address-label">From</label>
        <input
          type="text"
          className="address-input"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="Origin address"
        />
      </div>
      <div className="address-field">
        <label className="address-label">To</label>
        <input
          type="text"
          className="address-input"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Destination address"
        />
      </div>
      <button
        className="navigate-button"
        onClick={handleNavigate}
        disabled={!destination.trim() || routeLoading}
      >
        {routeLoading ? "Planning..." : "Navigate"}
      </button>
      <div className="preset-routes">
        <div className="preset-label">Quick Routes</div>
        {PRESET_DESTINATIONS.map((preset) => (
          <button
            key={preset.label}
            className="preset-button"
            onClick={() => handlePreset(preset.label)}
            disabled={routeLoading}
          >
            <span className="preset-name">{preset.label}</span>
            <span className="preset-sub">{preset.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnByTurn() {
  const directions = useSimulationStore((s) => s.routeDirections);
  const currentIdx = useSimulationStore((s) => s.currentDirectionIndex);
  const posS = useSimulationStore((s) => s.playerPositionS);

  if (directions.length === 0) return null;

  const current = directions[Math.min(currentIdx, directions.length - 1)];
  const distToTurn = Math.max(0, current.s - posS);
  const next = currentIdx + 1 < directions.length ? directions[currentIdx + 1] : null;

  return (
    <div className="carplay-turn-by-turn">
      <div className="turn-current">
        <div className="turn-arrow">
          {TURN_ARROWS[current.turnType] ?? "?"}
        </div>
        <div className="turn-info">
          <div className="turn-instruction">{current.instruction}</div>
          <div className="turn-distance">{formatDistance(distToTurn)}</div>
        </div>
      </div>
      {next && (
        <div className="turn-next">
          <span className="turn-next-label">Then</span>
          <span className="turn-next-arrow">{TURN_ARROWS[next.turnType] ?? "?"}</span>
          <span className="turn-next-instruction">{next.instruction}</span>
        </div>
      )}
    </div>
  );
}

function RouteStatus() {
  const distanceRemaining = useSimulationStore((s) => s.distanceRemaining);
  const etaSeconds = useSimulationStore((s) => s.etaSeconds);
  const routeSummary = useSimulationStore((s) => s.routeSummary);
  const player = useSimulationStore((s) => s.player);

  if (!routeSummary) return null;

  return (
    <div className="carplay-route-status">
      <div className="route-stat">
        <div className="route-stat-label">Remaining</div>
        <div className="route-stat-value">{formatDistance(distanceRemaining)}</div>
      </div>
      <div className="route-stat">
        <div className="route-stat-label">ETA</div>
        <div className="route-stat-value">{formatDuration(etaSeconds)}</div>
      </div>
      <div className="route-stat">
        <div className="route-stat-label">Speed</div>
        <div className="route-stat-value">{Math.round(player.speedMph)} mph</div>
      </div>
    </div>
  );
}

export function CarPlayDisplay() {
  const connected = useSimulationStore((s) => s.connected);
  const routeSummary = useSimulationStore((s) => s.routeSummary);
  const routeError = useSimulationStore((s) => s.routeError);
  const [activeTab, setActiveTab] = useState<NavTab>(
    routeSummary ? "status" : "navigate"
  );

  const handleNavigate = useCallback(async (origin: string, destination: string) => {
    const store = useSimulationStore.getState();
    store.setRouteLoading(true);
    store.setRouteError(null);

    try {
      const summary = await planRoute(origin, destination);

      const [geometry, directions] = await Promise.all([
        getRouteGeometry(),
        getRouteDirections(),
      ]);

      // Build preview polyline from control points for minimap
      const step = Math.max(1, Math.floor(geometry.controlPoints.length / 100));
      const previewPolyline: Array<[number, number]> = [];
      for (let i = 0; i < geometry.controlPoints.length; i += step) {
        const cp = geometry.controlPoints[i];
        previewPolyline.push([cp.x, cp.z]);
      }
      summary.previewPolyline = previewPolyline;
      summary.turnCount = directions.filter(
        (d) => d.turnType !== "straight" && d.turnType !== "arrive"
      ).length;

      store.setRouteSummary(summary);
      store.setRouteGeometry(geometry);
      store.setRouteDirections(directions);
      store.setCurrentDirectionIndex(0);
      setActiveTab("status");
    } catch {
      const mockGeo = generateMockRouteGeometry();
      const mockDirs = generateMockDirections(mockGeo);
      const mockSummary = generateMockRouteSummary(mockGeo, mockDirs);

      store.setRouteGeometry(mockGeo);
      store.setRouteDirections(mockDirs);
      store.setRouteSummary(mockSummary);
      store.setCurrentDirectionIndex(0);
      setActiveTab("status");
    } finally {
      store.setRouteLoading(false);
    }
  }, []);

  return (
    <div className="carplay-display">
      <div className="carplay-header">
        <div className="carplay-title">VoiceDrive Nav</div>
        <div className={`carplay-status ${connected ? "connected" : "disconnected"}`}>
          {connected ? "Connected" : "Offline"}
        </div>
      </div>

      <div className="carplay-tabs">
        <button
          className={`carplay-tab ${activeTab === "navigate" ? "active" : ""}`}
          onClick={() => setActiveTab("navigate")}
        >
          Route
        </button>
        <button
          className={`carplay-tab ${activeTab === "status" ? "active" : ""}`}
          onClick={() => setActiveTab("status")}
        >
          Navigation
        </button>
      </div>

      {routeError && (
        <div className="carplay-error">{routeError}</div>
      )}

      {activeTab === "navigate" && (
        <AddressPanel onNavigate={handleNavigate} />
      )}

      {activeTab === "status" && (
        <>
          <Minimap />
          <TurnByTurn />
          <RouteStatus />
        </>
      )}
    </div>
  );
}
