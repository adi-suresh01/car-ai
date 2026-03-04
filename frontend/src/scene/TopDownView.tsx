import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";
import { Road } from "./Road";
import { TrafficVehicles } from "./TrafficVehicle";

const TOP_DOWN_HEIGHT = 80;
const LANE_COUNT = 5;

function TopDownCamera() {
  const { camera } = useThree();

  useFrame(() => {
    const posX = (LANE_COUNT * PHYSICS.LANE_WIDTH_METERS) / 2;

    camera.position.set(posX, TOP_DOWN_HEIGHT, 0);
    camera.lookAt(posX, 0, 20);
  });

  return null;
}

function PlayerMarker() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const player = useSimulationStore.getState().player;
    const posX =
      player.laneIndex * PHYSICS.LANE_WIDTH_METERS + player.lateralOffset;

    if (meshRef.current) {
      meshRef.current.position.set(posX, 0.5, 0);
      meshRef.current.rotation.y = -player.headingRad;
    }
    if (glowRef.current) {
      glowRef.current.position.set(posX, 0.1, 0);
      const pulse = 1 + Math.sin(timeRef.current * 3) * 0.15;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <>
      <mesh ref={meshRef}>
        <coneGeometry args={[1.5, 4, 4]} />
        <meshStandardMaterial
          color={0x00aaff}
          emissive={0x0066cc}
          emissiveIntensity={0.8}
        />
      </mesh>
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2.4, 16]} />
        <meshStandardMaterial
          color={0x00aaff}
          emissive={0x0066cc}
          emissiveIntensity={0.5}
          transparent
          opacity={0.3}
        />
      </mesh>
    </>
  );
}

function TopDownScene() {
  return (
    <>
      <TopDownCamera />
      <ambientLight intensity={0.6} />
      <directionalLight position={[0, 100, 0]} intensity={1.0} />
      <Road />
      <PlayerMarker />
      <TrafficVehicles />
    </>
  );
}

export function TopDownView() {
  return (
    <Canvas
      orthographic
      camera={{
        zoom: 5,
        near: 0.1,
        far: 500,
        position: [9, TOP_DOWN_HEIGHT, 0],
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "#1a1a2e",
      }}
      frameloop="always"
      performance={{ min: 0.5 }}
    >
      <TopDownScene />
    </Canvas>
  );
}
