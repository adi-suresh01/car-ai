import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";
import { sampleSpline, interpolateSampleAtS, type SplineSample } from "./roadSpline";
import { Road } from "./Road";
import { SceneEnvironment } from "./Environment";
import { PlayerCar } from "./PlayerCar";
import { TrafficVehicles } from "./TrafficVehicle";
import { Scenery } from "./Scenery";
import { PostProcessing } from "./PostProcessing";
import { SpeedLines } from "./SpeedLines";
import { RearViewMirror } from "./RearViewMirror";

const BASE_FOV = 60;
const MAX_FOV_BOOST = 6;
const DRIVER_EYE_HEIGHT = 1.25;
const CAMERA_FORWARD_OFFSET = -0.3;
const BOB_AMPLITUDE = 0.003;
const BOB_FREQUENCY = 2.5;
const SWAY_AMPLITUDE = 0.002;
const SWAY_FREQUENCY = 1.3;
const ROLL_FACTOR = 0.015;
const CAMERA_HEADING_LERP = 0.08;

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

function CameraController() {
  const { camera } = useThree();
  const timeRef = useRef(0);
  const posRef = useRef(new THREE.Vector3());
  const targetRef = useRef(new THREE.Vector3());
  const smoothHeadingRef = useRef(0);
  const samplesRef = useRef<SplineSample[]>([]);

  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  useEffect(() => {
    if (routeGeometry) {
      samplesRef.current = sampleSpline(routeGeometry);
    } else {
      samplesRef.current = [];
    }
  }, [routeGeometry]);

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
    const posS = store.playerPositionS;
    const samples = samplesRef.current;

    let roadHeading = 0;
    const playerLaneX = player.laneIndex * PHYSICS.LANE_WIDTH_METERS + player.lateralOffset;

    if (samples.length > 0) {
      const sample = interpolateSampleAtS(samples, posS);
      roadHeading = Math.atan2(sample.tangent.x, sample.tangent.z);
    }

    smoothHeadingRef.current = lerpAngle(
      smoothHeadingRef.current,
      roadHeading,
      CAMERA_HEADING_LERP
    );

    const bob = Math.sin(t * BOB_FREQUENCY * Math.PI * 2) * BOB_AMPLITUDE * speedRatio;
    const sway = Math.sin(t * SWAY_FREQUENCY * Math.PI * 2) * SWAY_AMPLITUDE * speedRatio;

    posRef.current.set(playerLaneX + sway, DRIVER_EYE_HEIGHT + bob, CAMERA_FORWARD_OFFSET);
    camera.position.lerp(posRef.current, 0.15);

    const lookAheadDist = 30 + speedRatio * 40;
    const combinedHeading = smoothHeadingRef.current + player.headingRad;
    const lookX = playerLaneX + Math.sin(combinedHeading) * lookAheadDist;
    const lookZ = Math.cos(combinedHeading) * lookAheadDist;

    targetRef.current.set(lookX, DRIVER_EYE_HEIGHT - 0.15, lookZ);
    camera.lookAt(targetRef.current);

    const steerRoll = (-player.steerAngleDeg / PHYSICS.MAX_STEER_DEG) * ROLL_FACTOR;
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
      <SpeedLines />
      <RearViewMirror />
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
        powerPreference: "high-performance",
      }}
      camera={{
        fov: BASE_FOV,
        near: 0.1,
        far: 1200,
        position: [7.2, DRIVER_EYE_HEIGHT, 0],
      }}
      style={{ width: "100%", height: "100%" }}
      frameloop="always"
      performance={{ min: 0.5 }}
    >
      <DriverScene />
    </Canvas>
  );
}
