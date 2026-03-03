import { useSimulationStore } from "../../state/simulationStore";

const GEAR_LABELS = ["R", "N", "1", "2", "3", "4", "5", "6"];

export function GearIndicator() {
  const gear = useSimulationStore((s) => s.player.gear);
  const gearLabel = GEAR_LABELS[gear + 1] ?? String(gear);

  return (
    <div className="hud-gear">
      <div className="gear-label">GEAR</div>
      <div className="gear-value">{gearLabel}</div>
    </div>
  );
}
