import { useEffect } from "react";
import { DriverCameraView } from "./DriverCameraView";
import { TopDownCameraView } from "./TopDownCameraView";
import { useSimulationStore } from "../../state/useSimulationStore";
import { useGamepadControls } from "../../controllers/useGamepadControls";
import { useSimulationLoop } from "../../state/useSimulationLoop";

export const SimulatorView = () => {
  const loadLayout = useSimulationStore((state) => state.loadLayout);
  const isLoading = useSimulationStore((state) => state.isLoading);
  const error = useSimulationStore((state) => state.error);

  useGamepadControls();
  useSimulationLoop();

  useEffect(() => {
    loadLayout().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Failed to load layout", err);
    });
  }, [loadLayout]);

  return (
    <div className="simulator-layout">
      <section className="view-surface view-driver">
        {isLoading ? <div className="panel-loader overlay">Sampling freeway geometry…</div> : null}
        {error ? <div className="panel-error overlay">{error}</div> : null}
        <DriverCameraView />
      </section>
      <section className="view-surface view-overview">
        <TopDownCameraView />
      </section>
    </div>
  );
};
