import { useEffect } from "react";
import { useVoiceCapture } from "../controllers/useVoiceCapture";
import { useSimulationStore } from "../state/useSimulationStore";

const AlwaysOnVoiceListener = () => {
  const voiceListeningEnabled = useSimulationStore((state) => state.voiceListeningEnabled);
  const { enable, disable, enabled: isEnabled } = useVoiceCapture();

  useEffect(() => {
    if (voiceListeningEnabled && !isEnabled) {
      enable();
      return;
    }
    if (!voiceListeningEnabled && isEnabled) {
      disable();
    }
  }, [voiceListeningEnabled, isEnabled, enable, disable]);

  useEffect(() => () => disable(), [disable]);

  return null;
};

export default AlwaysOnVoiceListener;
