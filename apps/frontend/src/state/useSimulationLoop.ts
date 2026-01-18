import { useEffect } from "react";
import { useSimulationStore } from "./useSimulationStore";
import { simulationController } from "../controllers/simulationController";

export const useSimulationLoop = () => {
  const tick = useSimulationStore((state) => state.tick);
  const syncTraffic = useSimulationStore((state) => state.syncTraffic);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();

    const step = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      tick(Math.min(dt, 0.12));
      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [tick]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void syncTraffic();
      const { player } = useSimulationStore.getState();
      void simulationController.updatePlayer({
        laneIndex: player.laneIndex,
        speedMph: player.speedMph,
        positionZ: player.positionZ,
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [syncTraffic]);
};
