import { useEffect, useState, useCallback } from "react";
import { useSimulationStore } from "./state/simulationStore";
import {
  startSimulationLoop,
  stopSimulationLoop,
} from "./state/simulationLoop";
import { startInputListeners, stopInputListeners } from "./controllers/input";
import { fetchLayout } from "./services/api";
import { DriverView } from "./scene/DriverView";
import { TopDownView } from "./scene/TopDownView";
import { Speedometer } from "./components/HUD/Speedometer";
import { GearIndicator } from "./components/HUD/GearIndicator";
import { MissionStatus } from "./components/HUD/MissionStatus";
import { VoiceIndicator } from "./components/HUD/VoiceIndicator";
import { CarPlayDisplay } from "./components/Dashboard/CarPlayDisplay";
import { DashboardConsole } from "./components/Dashboard/DashboardConsole";
import { VoiceDebugPanel } from "./components/Voice/VoiceDebugPanel";
import { VoiceListener } from "./components/Voice/VoiceListener";

function CollisionOverlay() {
  const collision = useSimulationStore((s) => s.collision);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (collision) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(timer);
    }
  }, [collision]);

  if (!flash) return null;
  return <div className="collision-flash" />;
}

function ConnectionStatus() {
  const connected = useSimulationStore((s) => s.connected);

  return (
    <div className="connection-indicator">
      <div className={`connection-dot ${connected ? "connected" : "disconnected"}`} />
      <span>{connected ? "Live" : "Connecting..."}</span>
    </div>
  );
}

function ViewToggle() {
  const viewMode = useSimulationStore((s) => s.viewMode);
  const setViewMode = useSimulationStore((s) => s.setViewMode);

  return (
    <div className="view-toggle">
      <button
        className={viewMode === "driver" ? "active" : ""}
        onClick={() => setViewMode("driver")}
      >
        Driver
      </button>
      <button
        className={viewMode === "topdown" ? "active" : ""}
        onClick={() => setViewMode("topdown")}
      >
        Tactical
      </button>
    </div>
  );
}

export function App() {
  const viewMode = useSimulationStore((s) => s.viewMode);
  const showDebugPanel = useSimulationStore((s) => s.showDebugPanel);
  const toggleDebugPanel = useSimulationStore((s) => s.toggleDebugPanel);

  useEffect(() => {
    const setLayout = useSimulationStore.getState().setLayout;
    fetchLayout()
      .then((layout) => setLayout(layout))
      .catch(() => {
        // Layout fetch failed; simulation will operate without layout data
      });

    startSimulationLoop();
    startInputListeners();

    return () => {
      stopSimulationLoop();
      stopInputListeners();
    };
  }, []);

  const handleKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "`" || e.key === "~") {
        toggleDebugPanel();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const store = useSimulationStore.getState();
        store.setViewMode(store.viewMode === "driver" ? "topdown" : "driver");
      }
    },
    [toggleDebugPanel]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [handleKeyboardShortcuts]);

  return (
    <div className="app-container">
      <div className="scene-container">
        {viewMode === "driver" ? <DriverView /> : <TopDownView />}
      </div>

      <CollisionOverlay />

      <div className="hud-layer">
        <ConnectionStatus />
        <ViewToggle />

        <div className="hud-bottom-left">
          <Speedometer />
          <GearIndicator />
        </div>

        <div className="hud-bottom-right">
          <VoiceIndicator />
          <MissionStatus />
        </div>

        <div className="dashboard-sidebar">
          <CarPlayDisplay />
          <DashboardConsole />
          {showDebugPanel && <VoiceDebugPanel />}
        </div>
      </div>

      <VoiceListener />
    </div>
  );
}
