import { useEffect, useCallback } from "react";
import { useSimulationStore } from "../../state/simulationStore";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Driving",
    shortcuts: [
      { keys: ["W", "/", "Up"], description: "Throttle / Accelerate" },
      { keys: ["S", "/", "Down"], description: "Brake / Decelerate" },
      { keys: ["A", "/", "Left"], description: "Steer left" },
      { keys: ["D", "/", "Right"], description: "Steer right" },
    ],
  },
  {
    title: "Controls",
    shortcuts: [
      { keys: ["P"], description: "Toggle autopilot" },
      { keys: ["V", "/", "Tab"], description: "Toggle view mode" },
      { keys: ["N"], description: "Open scenario selector" },
      { keys: ["H"], description: "Toggle this help overlay" },
      { keys: ["`"], description: "Toggle debug panel" },
    ],
  },
  {
    title: "Voice",
    shortcuts: [
      { keys: ["Mic"], description: "Speak a command (always listening)" },
      { keys: ["\"cruise 65\""], description: "Set cruise speed" },
      { keys: ["\"lane left\""], description: "Change lanes" },
      { keys: ["\"overtake\""], description: "Pass slower traffic" },
    ],
  },
];

export function HelpOverlay() {
  const show = useSimulationStore((s) => s.showHelpOverlay);

  const handleClose = useCallback(() => {
    useSimulationStore.getState().toggleHelpOverlay();
  }, []);

  useEffect(() => {
    if (!show) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "h" || e.key === "H") {
        handleClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, handleClose]);

  if (!show) return null;

  return (
    <div className="help-overlay" role="dialog" aria-label="Keyboard Shortcuts">
      <div className="help-panel">
        <div className="help-header">
          <h2 className="help-title">Keyboard Shortcuts</h2>
          <button
            className="help-close"
            onClick={handleClose}
            aria-label="Close help overlay"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="help-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="help-group">
              <h3 className="help-group-title">{group.title}</h3>
              <div className="help-shortcuts">
                {group.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="help-shortcut-row">
                    <div className="help-keys">
                      {shortcut.keys.map((key, ki) => (
                        <span key={ki}>
                          {key === "/" ? (
                            <span className="help-key-sep">/</span>
                          ) : (
                            <kbd className="help-kbd">{key}</kbd>
                          )}
                        </span>
                      ))}
                    </div>
                    <span className="help-desc">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="help-footer">
          <span>Press H or Escape to close</span>
        </div>
      </div>
    </div>
  );
}
