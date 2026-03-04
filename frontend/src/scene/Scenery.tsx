import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { interpolateSampleAtS, type SplineSample, sampleSpline } from "./roadSpline";

/**
 * Animated roadside scenery: swaying grass patches alongside the road.
 * Follows player position along the spline.
 */
function SwayingGrass({ samples }: { samples: SplineSample[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  const grassPatches = useMemo(() => {
    const patches: Array<{ x: number; z: number; scale: number; phase: number }> = [];
    if (samples.length < 2) return patches;

    // Place grass along the road at intervals
    const step = 8;
    const roadWidth = 14; // approximate total road width
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i];
      // Grass on both sides of road
      for (const side of [-1, 1]) {
        const offset = roadWidth / 2 + 2 + Math.random() * 6;
        patches.push({
          x: s.position.x + s.normal.x * offset * side,
          z: s.position.z + s.normal.z * offset * side,
          scale: 0.5 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    return patches;
  }, [samples]);

  const grassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x4a8a2a,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    []
  );

  useFrame((_, delta) => {
    timeRef.current += delta;
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;

    if (samples.length > 0 && groupRef.current) {
      const playerSample = interpolateSampleAtS(samples, posS);
      groupRef.current.position.set(
        -playerSample.position.x,
        0,
        -playerSample.position.z
      );

      // Animate grass sway
      groupRef.current.children.forEach((child, i) => {
        if (i < grassPatches.length) {
          const sway = Math.sin(timeRef.current * 2 + grassPatches[i].phase) * 0.08;
          child.rotation.z = sway;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {grassPatches.slice(0, 200).map((patch, i) => (
        <mesh key={i} position={[patch.x, 0.3 * patch.scale, patch.z]} scale={patch.scale} material={grassMat}>
          <coneGeometry args={[0.15, 0.6, 4]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Animated birds flying in the distance
 */
function Birds() {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  const birdData = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      angle: (i / 8) * Math.PI * 2,
      height: 40 + Math.random() * 40,
      radius: 100 + Math.random() * 150,
      speed: 0.15 + Math.random() * 0.15,
      wingPhase: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (groupRef.current) {
      groupRef.current.children.forEach((bird, i) => {
        const d = birdData[i];
        const angle = d.angle + timeRef.current * d.speed;
        bird.position.set(
          Math.cos(angle) * d.radius,
          d.height + Math.sin(timeRef.current * 3 + d.wingPhase) * 2,
          Math.sin(angle) * d.radius
        );
        bird.rotation.y = -angle + Math.PI / 2;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {birdData.map((_, i) => (
        <mesh key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([-0.8, 0, 0, 0, 0.15, 0, 0.8, 0, 0]), 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial color={0x222222} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function Scenery() {
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  const samples = useMemo(() => {
    if (!routeGeometry) return [];
    return sampleSpline(routeGeometry);
  }, [routeGeometry]);

  return (
    <>
      <SwayingGrass samples={samples} />
      <Birds />
    </>
  );
}
