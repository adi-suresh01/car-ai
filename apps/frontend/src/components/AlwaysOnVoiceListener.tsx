import { useEffect } from "react";
import { useVoiceCapture } from "../controllers/useVoiceCapture";

const AlwaysOnVoiceListener = ({ enabled }: { enabled: boolean }) => {
  const { enable, disable, enabled: isEnabled } = useVoiceCapture();

  useEffect(() => {
    if (enabled && !isEnabled) {
      enable();
      return;
    }
    if (!enabled && isEnabled) {
      disable();
    }
  }, [enabled, isEnabled, enable, disable]);

  useEffect(() => () => disable(), [disable]);

  return null;
};

export default AlwaysOnVoiceListener;
