import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { interpolateSampleAtS, type SplineSample, sampleSpline } from "./roadSpline";

// ── Lush grass fields alongside the road ──

const grassBladeMat = new THREE.MeshStandardMaterial({
  color: 0x5a8a3a,
  roughness: 0.88,
  metalness: 0,
  side: THREE.DoubleSide,
});

const darkGrassMat = new THREE.MeshStandardMaterial({
  color: 0x3a6a28,
  roughness: 0.9,
  metalness: 0,
  side: THREE.DoubleSide,
});

const bushMat = new THREE.MeshStandardMaterial({
  color: 0x3a5a28,
  roughness: 0.92,
  metalness: 0,
});

const darkBushMat = new THREE.MeshStandardMaterial({
  color: 0x2a4a1e,
  roughness: 0.92,
  metalness: 0,
});

function GrassFields({ samples }: { samples: SplineSample[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  const grassData = useMemo(() => {
    const patches: Array<{
      x: number;
      z: number;
      scaleX: number;
      scaleY: number;
      rotY: number;
      phase: number;
      dark: boolean;
    }> = [];
    if (samples.length < 2) return patches;

    const step = 4;
    const roadWidth = 14;
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i];
      for (const side of [-1, 1]) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < count; j++) {
          const offset = roadWidth / 2 + 1.5 + Math.random() * 12;
          const along = (Math.random() - 0.5) * step * 2;
          const tangentOffset = s.tangent.x * along;
          const tangentOffsetZ = s.tangent.z * along;
          patches.push({
            x: s.position.x + s.normal.x * offset * side + tangentOffset,
            z: s.position.z + s.normal.z * offset * side + tangentOffsetZ,
            scaleX: 0.3 + Math.random() * 0.4,
            scaleY: 0.4 + Math.random() * 0.6,
            rotY: Math.random() * Math.PI,
            phase: Math.random() * Math.PI * 2,
            dark: Math.random() > 0.5,
          });
        }
      }
    }
    return patches;
  }, [samples]);

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

      const t = timeRef.current;
      groupRef.current.children.forEach((child, i) => {
        if (i < grassData.length) {
          const sway = Math.sin(t * 1.8 + grassData[i].phase) * 0.06;
          child.rotation.z = sway;
        }
      });
    }
  });

  const bladeGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.06, 0);
    shape.lineTo(0.06, 0);
    shape.lineTo(0.02, 0.5);
    shape.lineTo(0, 0.55);
    shape.lineTo(-0.02, 0.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  return (
    <group ref={groupRef}>
      {grassData.slice(0, 500).map((g, i) => (
        <mesh
          key={i}
          position={[g.x, 0, g.z]}
          rotation={[0, g.rotY, 0]}
          scale={[g.scaleX, g.scaleY, g.scaleX]}
          geometry={bladeGeom}
          material={g.dark ? darkGrassMat : grassBladeMat}
        />
      ))}
    </group>
  );
}

// ── Bushes and hedgerows along road edges ──

function Bushes({ samples }: { samples: SplineSample[] }) {
  const groupRef = useRef<THREE.Group>(null);

  const bushData = useMemo(() => {
    const bushes: Array<{
      x: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      dark: boolean;
    }> = [];
    if (samples.length < 2) return bushes;

    const step = 12;
    const roadWidth = 14;
    for (let i = 0; i < samples.length; i += step) {
      if (Math.random() > 0.6) continue;
      const s = samples[i];
      const side = Math.random() > 0.5 ? 1 : -1;
      const offset = roadWidth / 2 + 1 + Math.random() * 3;
      bushes.push({
        x: s.position.x + s.normal.x * offset * side,
        z: s.position.z + s.normal.z * offset * side,
        sx: 1.2 + Math.random() * 1.5,
        sy: 0.6 + Math.random() * 0.8,
        sz: 1.0 + Math.random() * 1.2,
        dark: Math.random() > 0.5,
      });
    }
    return bushes;
  }, [samples]);

  const bushGeom = useMemo(() => new THREE.IcosahedronGeometry(0.5, 1), []);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;
    if (samples.length > 0 && groupRef.current) {
      const playerSample = interpolateSampleAtS(samples, posS);
      groupRef.current.position.set(
        -playerSample.position.x,
        0,
        -playerSample.position.z
      );
    }
  });

  return (
    <group ref={groupRef}>
      {bushData.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.sy * 0.4, b.z]}
          scale={[b.sx, b.sy, b.sz]}
          geometry={bushGeom}
          material={b.dark ? darkBushMat : bushMat}
        />
      ))}
    </group>
  );
}

// ── Birds ──

function Birds() {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  const birdData = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => ({
      angle: (i / 5) * Math.PI * 2,
      height: 50 + Math.random() * 50,
      radius: 120 + Math.random() * 180,
      speed: 0.1 + Math.random() * 0.12,
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
          d.height + Math.sin(timeRef.current * 2.5 + d.wingPhase) * 1.5,
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
              args={[new Float32Array([-0.6, 0, 0, 0, 0.1, 0, 0.6, 0, 0]), 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial color={0x333333} side={THREE.DoubleSide} />
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
      <GrassFields samples={samples} />
      <Bushes samples={samples} />
      <Birds />
    </>
  );
}
