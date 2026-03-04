import { useEffect, useCallback } from "react";
import { useSimulationStore } from "../../state/simulationStore";
import { fetchScenarios, loadScenario, fetchLayout } from "../../services/api";

export function ScenarioSelector() {
  const show = useSimulationStore((s) => s.showScenarioSelector);
  const scenarios = useSimulationStore((s) => s.scenarios);
  const activeId = useSimulationStore((s) => s.activeScenarioId);
  const loading = useSimulationStore((s) => s.scenariosLoading);

  useEffect(() => {
    if (!show) return;

    const store = useSimulationStore.getState();
    if (store.scenarios.length > 0) return;

    store.setScenariosLoading(true);
    fetchScenarios()
      .then((data) => {
        store.setScenarios(data);
      })
      .catch(() => {
        store.setScenarios([]);
      })
      .finally(() => {
        store.setScenariosLoading(false);
      });
  }, [show]);

  const handleLoad = useCallback((scenarioName: string) => {
    const store = useSimulationStore.getState();
    store.setScenariosLoading(true);

    loadScenario(scenarioName)
      .then(() => {
        store.setActiveScenarioId(scenarioName);
        return fetchLayout();
      })
      .then((layout) => {
        store.setLayout(layout);
      })
      .catch(() => {
        // Scenario load or layout refresh failed
      })
      .finally(() => {
        store.setScenariosLoading(false);
        store.setShowScenarioSelector(false);
      });
  }, []);

  const handleClose = useCallback(() => {
    useSimulationStore.getState().setShowScenarioSelector(false);
  }, []);

  useEffect(() => {
    if (!show) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, handleClose]);

  if (!show) return null;

  return (
    <div className="scenario-overlay" role="dialog" aria-label="Scenario Selection">
      <div className="scenario-panel">
        <div className="scenario-header">
          <h2 className="scenario-title">Scenarios</h2>
          <button
            className="scenario-close"
            onClick={handleClose}
            aria-label="Close scenario selector"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="scenario-loading">
            <div className="scenario-spinner" />
            <span>Loading scenarios...</span>
          </div>
        )}

        {!loading && scenarios.length === 0 && (
          <div className="scenario-empty">
            No scenarios available. The backend may not support the scenario endpoint yet.
          </div>
        )}

        {!loading && scenarios.length > 0 && (
          <div className="scenario-grid">
            {scenarios.map((scenario) => {
              const isActive = scenario.name === activeId;
              return (
                <button
                  key={scenario.name}
                  className={`scenario-card ${isActive ? "scenario-card-active" : ""}`}
                  onClick={() => handleLoad(scenario.name)}
                  disabled={isActive}
                  aria-pressed={isActive}
                >
                  <div className="scenario-card-header">
                    <span className="scenario-card-name">{scenario.name}</span>
                  </div>
                  <p className="scenario-card-desc">{scenario.description}</p>
                  <div className="scenario-card-meta">
                    <span>{scenario.npcCount} NPCs</span>
                    <span>{scenario.numLanes} lanes</span>
                  </div>
                  {isActive && <div className="scenario-active-badge">Active</div>}
                </button>
              );
            })}
          </div>
        )}

        <div className="scenario-footer">
          <span className="scenario-hint">Press Escape or click outside to close</span>
        </div>
      </div>
    </div>
  );
}
