import { useSimulationStore } from "../state/useSimulationStore";

const SettingsPanel = () => {
  const voiceListeningEnabled = useSimulationStore((state) => state.voiceListeningEnabled);
  const setVoiceListeningEnabled = useSimulationStore((state) => state.setVoiceListeningEnabled);

  return (
    <div className="settings-panel">
      <div className="settings-title">Settings</div>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={voiceListeningEnabled}
          onChange={(event) => setVoiceListeningEnabled(event.target.checked)}
        />
        <span>Always-on voice listening</span>
      </label>
    </div>
  );
};

export default SettingsPanel;
