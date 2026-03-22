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

const BASE_FOV = 65;
const MAX_FOV_BOOST = 6;
const DRIVER_EYE_HEIGHT = 1.22;
const CAMERA_FORWARD_OFFSET = 0.05;
const CAMERA_HEADING_LERP = 0.25;
const CAMERA_PITCH = -0.18;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

function CameraController() {
  const { camera } = useThree();
  const smoothTangentRef = useRef<THREE.Vector3 | null>(null);
  const samplesRef = useRef<SplineSample[]>([]);
  const lookAtMatRef = useRef(new THREE.Matrix4());
  const pitchQuatRef = useRef(new THREE.Quaternion());

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

    camera.position.set(playerLaneX, DRIVER_EYE_HEIGHT, CAMERA_FORWARD_OFFSET);

    // Use lookAt to orient camera — preserves handedness (no L/R mirror)
    const st = smoothTangentRef.current;
    const lookTarget = new THREE.Vector3(
      camera.position.x + st.x * 100,
      camera.position.y + CAMERA_PITCH * 20,
      camera.position.z + st.z * 100
    );
    camera.lookAt(lookTarget);

    // Subtle roll when steering for immersion
    const steerRatio = player.steerAngleDeg / PHYSICS.MAX_STEER_DEG;
    camera.rotation.z = -steerRatio * 0.03;

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
        toneMappingExposure: 0.8,
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
