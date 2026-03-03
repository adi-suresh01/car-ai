import { useSimulationStore } from "../../state/simulationStore";

export function SettingsPanel() {
  const viewMode = useSimulationStore((s) => s.viewMode);
  const setViewMode = useSimulationStore((s) => s.setViewMode);
  const showDebugPanel = useSimulationStore((s) => s.showDebugPanel);
  const toggleDebugPanel = useSimulationStore((s) => s.toggleDebugPanel);

  return (
    <div className="settings-panel">
      <h3>Settings</h3>
      <div className="settings-group">
        <label className="setting-label">View Mode</label>
        <div className="setting-buttons">
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
            Top Down
          </button>
        </div>
      </div>
      <div className="settings-group">
        <label className="setting-label">
          <input
            type="checkbox"
            checked={showDebugPanel}
            onChange={toggleDebugPanel}
          />
          Show Debug Panel
        </label>
      </div>
    </div>
  );
}
