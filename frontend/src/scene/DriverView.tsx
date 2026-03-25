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
const BASE_FOV = 60;
const MAX_FOV_BOOST = 3;
const DRIVER_EYE_HEIGHT = 1.22;
const CAMERA_FORWARD_OFFSET = 0.05;
const CAMERA_HEADING_LERP = 0.25;
const CAMERA_PITCH = -0.22;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function CameraController() {
  const { camera } = useThree();
  const smoothTangentRef = useRef<THREE.Vector3 | null>(null);
  const samplesRef = useRef<SplineSample[]>([]);
  const bobTimeRef = useRef(0);

  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  useEffect(() => {
    if (routeGeometry) {
      samplesRef.current = sampleSpline(routeGeometry);
    } else {
      samplesRef.current = [];
    }
  }, [routeGeometry]);

  useEffect(() => {
    camera.up.copy(WORLD_UP);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = BASE_FOV;
      camera.near = 0.1;
      camera.far = 1200;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const player = store.player;
    const speedRatio = player.speedMph / PHYSICS.MAX_SPEED_MPH;
    const posS = store.playerPositionS;
    const samples = samplesRef.current;

    // Get road tangent at player position
    let tangent = new THREE.Vector3(0, 0, 1);
    if (samples.length > 0) {
      const sample = interpolateSampleAtS(samples, posS);
      if (sample.tangent.lengthSq() > 0.001) {
        tangent.copy(sample.tangent).normalize();
      }
    }

    // Smooth the tangent direction
    if (smoothTangentRef.current === null) {
      smoothTangentRef.current = tangent.clone();
    } else {
      smoothTangentRef.current.lerp(tangent, CAMERA_HEADING_LERP).normalize();
    }

    const laneCount = store.routeGeometry?.laneCount ?? 4;
    const halfRoad = (laneCount * PHYSICS.LANE_WIDTH_METERS) / 2;
    const playerLaneX =
      (player.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS -
      halfRoad +
      player.lateralOffset;

    // Subtle speed-based camera bob
    bobTimeRef.current += speedRatio * 0.08;
    const bobY = Math.sin(bobTimeRef.current * 10) * speedRatio * 0.002;
    const bobX = Math.sin(bobTimeRef.current * 6) * speedRatio * 0.001;

    camera.position.set(playerLaneX + bobX, DRIVER_EYE_HEIGHT + bobY, CAMERA_FORWARD_OFFSET);

    // Ensure up vector is correct before lookAt
    camera.up.set(0, 1, 0);

    const st = smoothTangentRef.current;
    const lookTarget = new THREE.Vector3(
      camera.position.x + st.x * 100,
      camera.position.y + CAMERA_PITCH * 20,
      camera.position.z + st.z * 100
    );
    camera.lookAt(lookTarget);

    // Apply steering roll around the camera's local look axis (not Euler Z)
    const steerRatio = player.steerAngleDeg / PHYSICS.MAX_STEER_DEG;
    if (Math.abs(steerRatio) > 0.001) {
      camera.rotateZ(-steerRatio * 0.03);
    }

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
        toneMappingExposure: 0.95,
        outputColorSpace: THREE.SRGBColorSpace,
        powerPreference: "high-performance",
      }}
      camera={{
        fov: BASE_FOV,
        near: 0.1,
        far: 1200,
        position: [1.8, DRIVER_EYE_HEIGHT, CAMERA_FORWARD_OFFSET],
        up: [0, 1, 0],
      }}
      style={{ width: "100%", height: "100%" }}
      frameloop="always"
      performance={{ min: 0.5 }}
    >
      <DriverScene />
    </Canvas>
  );
}
