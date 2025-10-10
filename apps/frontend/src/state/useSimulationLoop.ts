import { useEffect } from "react";
import { useSimulationStore } from "./useSimulationStore";

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
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [syncTraffic]);
};
