import { useMemo } from "react";
import { useSimulationStore } from "../state/useSimulationStore";

const DashboardConsole = () => {
  const dashboard = useSimulationStore((state) => state.dashboard);
  const voiceStatus = useSimulationStore((state) => state.voiceStatus);
  const voiceHistory = useSimulationStore((state) => state.voiceHistory);

  const subtitle = useMemo(() => {
    if (dashboard.activeApp === "maps") {
      return "US-101 South · Next exit 1.2 mi";
    }
    if (dashboard.activeApp === "media") {
      return "Drive Mode Playlist";
    }
    if (dashboard.activeApp === "climate") {
      return "Cabin · Auto Comfort";
    }
    return "Voice Assistant";
  }, [dashboard.activeApp]);

  return (
    <div className="dashboard-console">
      <div className="dashboard-header">
        <div>
          <span className="dashboard-app">{dashboard.activeApp.toUpperCase()}</span>
          <div className="dashboard-subtitle">{subtitle}</div>
        </div>
        <div className={`dashboard-tone ${dashboard.tone}`}>{dashboard.tone}</div>
      </div>
      <div className="dashboard-main">
        <div className="dashboard-headline">{dashboard.headline}</div>
        <div className="dashboard-detail">{dashboard.detail}</div>
        {dashboard.items && dashboard.items.length > 0 ? (
          <ul className="dashboard-list">
            {dashboard.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {dashboard.subline ? <div className="dashboard-subline">{dashboard.subline}</div> : null}
        <div className="dashboard-voice">
          <span>Last voice</span>
          <strong>{voiceStatus?.lastUtterance ?? "Say a command to begin"}</strong>
        </div>
        {voiceHistory.length > 0 ? (
          <div className="dashboard-history">
            <span>History</span>
            <ul>
              {voiceHistory.map((entry) => (
                <li key={`${entry.utterance}-${entry.timestamp ?? ""}`}>
                  <strong>{entry.utterance}</strong>
                  {entry.summary ? <em>{entry.summary}</em> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="dashboard-footer">
        <div className="dashboard-pill">Navigation</div>
        <div className="dashboard-pill">Safety Scan</div>
        <div className="dashboard-pill">Media</div>
        <div className="dashboard-pill">Climate</div>
      </div>
    </div>
  );
};

export default DashboardConsole;
