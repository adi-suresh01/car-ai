import { useEffect, useState } from "react";
import { useSimulationStore } from "../state/useSimulationStore";

const LaneChangeToast = () => {
  const voiceStatus = useSimulationStore((state) => state.voiceStatus);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const summary = voiceStatus?.summary ?? "";
    if (!summary) return undefined;
    const normalized = summary.toLowerCase();
    if (!normalized.includes("lane")) return undefined;
    setMessage(summary);
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [voiceStatus?.summary]);

  if (!visible) {
    return null;
  }

  return <div className="lane-change-toast">{message}</div>;
};

export default LaneChangeToast;
