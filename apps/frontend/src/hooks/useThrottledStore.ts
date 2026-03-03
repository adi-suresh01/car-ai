import { useRef, useCallback, useSyncExternalStore } from "react";
import { useSimulationStore } from "../state/simulationStore";

type StoreState = ReturnType<typeof useSimulationStore.getState>;

export function useThrottledSelector<T>(
  selector: (state: StoreState) => T,
  intervalMs: number = 100
): T {
  const lastUpdateRef = useRef(0);
  const cachedRef = useRef<T>(selector(useSimulationStore.getState()));

  const getSnapshot = useCallback(() => {
    const now = performance.now();
    if (now - lastUpdateRef.current >= intervalMs) {
      lastUpdateRef.current = now;
      cachedRef.current = selector(useSimulationStore.getState());
    }
    return cachedRef.current;
  }, [selector, intervalMs]);

  const subscribe = useCallback(
    (callback: () => void) => {
      return useSimulationStore.subscribe(() => {
        const now = performance.now();
        if (now - lastUpdateRef.current >= intervalMs) {
          callback();
        }
      });
    },
    [intervalMs]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
