import { useEffect } from "react";
import { useSimulationStore } from "../state/useSimulationStore";

const DEADZONE = 0.12;

const applyDeadzone = (value: number) => {
  if (Math.abs(value) < DEADZONE) {
    return 0;
  }
  const sign = Math.sign(value);
  const magnitude = (Math.abs(value) - DEADZONE) / (1 - DEADZONE);
  return sign * Math.min(1, Math.max(0, magnitude));
};

export const useGamepadControls = () => {
  const updateControlInput = useSimulationStore((state) => state.updateControlInput);

  useEffect(() => {
    let animation: number;

    const poll = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const activePad = Array.from(pads).find((pad): pad is Gamepad => Boolean(pad && pad.connected));

      if (activePad) {
        const [axisX = 0, axisY = 0] = activePad.axes;
        const steering = applyDeadzone(axisX);
        const vertical = applyDeadzone(axisY);

        const throttle = vertical < 0 ? -vertical : 0;
        const brake = vertical > 0 ? vertical : 0;

        updateControlInput({ steering, throttle, brake });
      }

      animation = requestAnimationFrame(poll);
    };

    animation = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(animation);
      updateControlInput({ steering: 0, throttle: 0, brake: 0 });
    };
  }, [updateControlInput]);
};
