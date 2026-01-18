import { strict as assert } from "assert";
import { DrivingEnvironment } from "./drivingEnv";

const runTests = () => {
  const env = new DrivingEnvironment({ seed: 42 });
  const { snapshot } = env.reset();
  const initialCount = snapshot.vehicles.length;
  let latestSnapshot = snapshot;

  for (let i = 0; i < 400; i += 1) {
    const step = env.step({ acceleration: 0, brake: 0 });
    latestSnapshot = step.info.snapshot;
  }

  assert.ok(latestSnapshot.vehicles.length > 0);
  assert.equal(latestSnapshot.vehicles.length, initialCount);
  latestSnapshot.vehicles.forEach((vehicle) => {
    assert.ok(Number.isFinite(vehicle.position[2]));
    assert.ok(vehicle.position[2] < 1400);
  });
};

if (require.main === module) {
  runTests();
  // eslint-disable-next-line no-console
  console.log("drivingEnv tests passed");
}

export { runTests };
