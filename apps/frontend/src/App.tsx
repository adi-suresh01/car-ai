import { useEffect, useState, useCallback, useRef } from "react";
import { useSimulationStore } from "./state/simulationStore";
import {
  startSimulationLoop,
  stopSimulationLoop,
} from "./state/simulationLoop";
import { startInputListeners, stopInputListeners } from "./controllers/input";
import { autopilot } from "./controllers/autopilot";
import { fetchLayout } from "./services/api";
import { DriverView } from "./scene/DriverView";
import { TopDownView } from "./scene/TopDownView";
import { Speedometer } from "./components/HUD/Speedometer";
import { GearIndicator } from "./components/HUD/GearIndicator";
import { MissionStatus } from "./components/HUD/MissionStatus";
import { VoiceIndicator } from "./components/HUD/VoiceIndicator";
import { AutopilotIndicator } from "./components/HUD/AutopilotIndicator";
import { HelpOverlay } from "./components/HUD/HelpOverlay";
import { CarPlayDisplay } from "./components/Dashboard/CarPlayDisplay";
import { DashboardConsole } from "./components/Dashboard/DashboardConsole";
import { VoiceDebugPanel } from "./components/Voice/VoiceDebugPanel";
import { VoiceListener } from "./components/Voice/VoiceListener";
import { ScenarioSelector } from "./components/Settings/ScenarioSelector";

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

function HelpHint() {
  return (
    <div className="help-hint">
      <kbd className="help-hint-key">H</kbd>
      <span>Help</span>
    </div>
  );
}

function ViewTransition() {
  const progress = useSimulationStore((s) => s.viewTransitionProgress);

  if (progress >= 1) return null;

  const opacity = 1 - progress;
  return (
    <div
      className="view-transition-overlay"
      style={{ opacity }}
    />
  );
}

function toggleAutopilot(): void {
  const store = useSimulationStore.getState();
  if (!store.autopilotReady) return;

  const next = !store.autopilotEnabled;
  store.setAutopilotEnabled(next);

  if (next) {
    autopilot.start();
  } else {
    autopilot.stop();
  }
}

function switchView(): void {
  const store = useSimulationStore.getState();
  const next = store.viewMode === "driver" ? "topdown" : "driver";

  store.setViewTransitionProgress(0);
  store.setViewMode(next);

  let start: number | null = null;
  const duration = 300;

  function animate(ts: number) {
    if (start === null) start = ts;
    const elapsed = ts - start;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    useSimulationStore.getState().setViewTransitionProgress(eased);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  requestAnimationFrame(animate);
}

export function App() {
  const viewMode = useSimulationStore((s) => s.viewMode);
  const showDebugPanel = useSimulationStore((s) => s.showDebugPanel);
  const toggleDebugPanel = useSimulationStore((s) => s.toggleDebugPanel);
  const toggleHelpOverlay = useSimulationStore((s) => s.toggleHelpOverlay);

  useEffect(() => {
    const setLayout = useSimulationStore.getState().setLayout;
    fetchLayout()
      .then((layout) => setLayout(layout))
      .catch(() => {
        // Layout fetch failed; simulation will operate without layout data
      });

    autopilot.initialize();

    startSimulationLoop();
    startInputListeners();

    return () => {
      autopilot.stop();
      stopSimulationLoop();
      stopInputListeners();
    };
  }, []);

  const handleKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      const store = useSimulationStore.getState();

      if (store.showScenarioSelector || store.showHelpOverlay) return;

      if (e.key === "`" || e.key === "~") {
        toggleDebugPanel();
      }
      if (e.key === "Tab" || e.key === "v" || e.key === "V") {
        if (e.key === "Tab") e.preventDefault();
        switchView();
      }
      if (e.key === "p" || e.key === "P") {
        toggleAutopilot();
      }
      if (e.key === "h" || e.key === "H") {
        toggleHelpOverlay();
      }
      if (e.key === "n" || e.key === "N") {
        store.setShowScenarioSelector(true);
      }
    },
    [toggleDebugPanel, toggleHelpOverlay]
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

      <ViewTransition />
      <CollisionOverlay />

      <div className="hud-layer">
        <ConnectionStatus />
        <ViewToggle />
        <HelpHint />

        <div className="hud-bottom-left">
          <Speedometer />
          <GearIndicator />
        </div>

        <div className="hud-bottom-right">
          <AutopilotIndicator />
          <VoiceIndicator />
          <MissionStatus />
        </div>

        <div className="dashboard-sidebar">
          <CarPlayDisplay />
          <DashboardConsole />
          {showDebugPanel && <VoiceDebugPanel />}
        </div>
      </div>

      <HelpOverlay />
      <ScenarioSelector />
      <VoiceListener />
    </div>
  );
}
