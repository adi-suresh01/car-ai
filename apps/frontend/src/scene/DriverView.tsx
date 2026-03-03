import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";
import { Road } from "./Road";
import { SceneEnvironment } from "./Environment";
import { PlayerCar } from "./PlayerCar";
import { TrafficVehicles } from "./TrafficVehicle";
import { Scenery } from "./Scenery";
import { PostProcessing } from "./PostProcessing";

const BASE_FOV = 60;
const MAX_FOV_BOOST = 6;
const DRIVER_EYE_HEIGHT = 1.25;
const CAMERA_FORWARD_OFFSET = -0.3;
const BOB_AMPLITUDE = 0.003;
const BOB_FREQUENCY = 2.5;
const SWAY_AMPLITUDE = 0.002;
const SWAY_FREQUENCY = 1.3;
const ROLL_FACTOR = 0.015;

function CameraController() {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const { camera } = useThree();
  const timeRef = useRef(0);

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = BASE_FOV;
      camera.near = 0.1;
      camera.far = 1200;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current;

    const store = useSimulationStore.getState();
    const player = store.player;
    const speedRatio = player.speedMph / PHYSICS.MAX_SPEED_MPH;

    const posX =
      player.laneIndex * PHYSICS.LANE_WIDTH_METERS + player.lateralOffset;
    const posY = DRIVER_EYE_HEIGHT;
    const posZ = CAMERA_FORWARD_OFFSET;

    const bob = Math.sin(t * BOB_FREQUENCY * Math.PI * 2) * BOB_AMPLITUDE * speedRatio;
    const sway =
      Math.sin(t * SWAY_FREQUENCY * Math.PI * 2) * SWAY_AMPLITUDE * speedRatio;

    camera.position.set(posX + sway, posY + bob, posZ);

    const lookAheadDist = 30 + speedRatio * 40;
    const steerOffsetX =
      Math.sin(player.headingRad) * lookAheadDist * 0.3;

    camera.lookAt(
      posX + steerOffsetX,
      DRIVER_EYE_HEIGHT - 0.15,
      lookAheadDist
    );

    const steerRoll =
      (-player.steerAngleDeg / PHYSICS.MAX_STEER_DEG) * ROLL_FACTOR;
    camera.rotation.z = steerRoll;

    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = BASE_FOV + MAX_FOV_BOOST * speedRatio;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.05);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function DriverScene() {
  return (
    <>
      <CameraController />
      <SceneEnvironment />
      <Road />
      <PlayerCar />
      <TrafficVehicles />
      <Scenery />
      <PostProcessing />
    </>
  );
}

export function DriverView() {
  return (
    <Canvas
      shadows
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      camera={{
        fov: BASE_FOV,
        near: 0.1,
        far: 1200,
        position: [7.2, DRIVER_EYE_HEIGHT, 0],
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <DriverScene />
    </Canvas>
  );
}
