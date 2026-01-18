import { strict as assert } from "assert";
import { parseVoiceMission } from "./voiceCommandParser";

const runTests = () => {
  const context = { currentSpeedMph: 62, currentLaneIndex: 2, laneCount: 5 };

  const cruise = parseVoiceMission("Cruise control 70 mph", context);
  assert.ok(cruise);
  assert.equal(cruise.update.mode, "cruise");
  assert.equal(cruise.update.cruiseTargetSpeedMph, 70);

  const moveLeft = parseVoiceMission("Move left", context);
  assert.ok(moveLeft);
  assert.equal(moveLeft.update.mode, "lane_change");
  assert.equal(moveLeft.update.targetLaneIndex, 1);

  const setSpeed = parseVoiceMission("Set speed to 55 mph", context);
  assert.ok(setSpeed);
  assert.equal(setSpeed.update.mode, "cruise");
  assert.equal(setSpeed.update.cruiseTargetSpeedMph, 55);
};

if (require.main === module) {
  runTests();
  // eslint-disable-next-line no-console
  console.log("voiceCommandParser tests passed");
}

export { runTests };
