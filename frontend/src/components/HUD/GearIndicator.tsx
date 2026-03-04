import { useSimulationStore } from "../../state/simulationStore";

// Gear values: -1 (reverse) -> index 0, 0 (neutral) -> index 1, 1-6 -> index 2-7
const GEAR_LABELS = ["R", "N", "1", "2", "3", "4", "5", "6"];

export function GearIndicator() {
  const gear = useSimulationStore((s) => s.player.gear);
  const labelIndex = gear + 1;
  const gearLabel =
    labelIndex >= 0 && labelIndex < GEAR_LABELS.length
      ? GEAR_LABELS[labelIndex]
      : String(gear);

  return (
    <div className="hud-gear">
      <div className="gear-label">GEAR</div>
      <div className="gear-value">{gearLabel}</div>
    </div>
  );
}
