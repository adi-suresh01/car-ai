import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment as DreiEnvironment, Sky } from "@react-three/drei";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

const TERRAIN_WIDTH = 800;
const TERRAIN_LENGTH = 1200;
const TREE_COUNT = 120;
const LANE_COUNT = 5;

function GroundPlane() {
  const groundTexture = useMemo(() => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const noise = Math.random() * 15;
      const idx = i * 4;
      data[idx] = 35 + noise;
      data[idx + 1] = 55 + noise;
      data[idx + 2] = 28 + noise;
      data[idx + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    tex.needsUpdate = true;
    return tex;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[TERRAIN_WIDTH, TERRAIN_LENGTH]} />
      <meshStandardMaterial
        map={groundTexture}
        color={0x2d4a1a}
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}

function Trees() {
  const groupRef = useRef<THREE.Group>(null);
  const playerZ = useSimulationStore((s) => s.player.positionZ);

  const treeData = useMemo(() => {
    const data: { x: number; z: number; scale: number; trunkH: number }[] = [];
    const roadRight = LANE_COUNT * PHYSICS.LANE_WIDTH_METERS + 6;
    const roadLeft = -6;

    for (let i = 0; i < TREE_COUNT; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const baseX = side === 1 ? roadRight : roadLeft;
      const offsetX = (Math.random() * 60 + 8) * side;
      const z = (Math.random() - 0.5) * TERRAIN_LENGTH;
      const scale = 0.7 + Math.random() * 0.8;
      const trunkH = 2 + Math.random() * 2;
      data.push({ x: baseX + offsetX, z, scale, trunkH });
    }
    return data;
  }, []);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.z = -(playerZ % TERRAIN_LENGTH);
    }
  });

  return (
    <group ref={groupRef}>
      {treeData.map((tree, i) => (
        <group key={i} position={[tree.x, 0, tree.z]} scale={tree.scale}>
          <mesh position={[0, tree.trunkH / 2, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.25, tree.trunkH, 6]} />
            <meshStandardMaterial color={0x4a3520} roughness={0.9} />
          </mesh>

          <mesh position={[0, tree.trunkH + 1.5, 0]} castShadow>
            <coneGeometry args={[2.2, 4, 7]} />
            <meshStandardMaterial color={0x1a4a1a} roughness={0.85} />
          </mesh>
          <mesh position={[0, tree.trunkH + 3.0, 0]} castShadow>
            <coneGeometry args={[1.6, 3, 7]} />
            <meshStandardMaterial color={0x1d5a1d} roughness={0.85} />
          </mesh>
          <mesh position={[0, tree.trunkH + 4.2, 0]} castShadow>
            <coneGeometry args={[1.0, 2.2, 6]} />
            <meshStandardMaterial color={0x206620} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DistantHills() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1600, 200, 64, 1);
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      if (y > 0) {
        const hill =
          Math.sin(x * 0.008) * 40 +
          Math.sin(x * 0.02) * 15 +
          Math.sin(x * 0.005 + 1.5) * 30;
        positions.setZ(i, Math.max(0, hill));
      }
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, -500]} rotation={[0, 0, 0]}>
      <meshStandardMaterial
        color={0x2a3f1f}
        roughness={1}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function SceneEnvironment() {
  return (
    <>
      <Sky
        distance={450000}
        sunPosition={[100, 40, -60]}
        inclination={0.52}
        azimuth={0.25}
        rayleigh={0.5}
        turbidity={8}
      />

      <DreiEnvironment preset="sunset" background={false} />

      <ambientLight intensity={0.25} color={0xffeedd} />

      <directionalLight
        position={[80, 100, -40]}
        intensity={1.8}
        color={0xfff0dd}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-bias={-0.001}
      />

      <hemisphereLight
        color={0x88aacc}
        groundColor={0x443322}
        intensity={0.4}
      />

      <fog attach="fog" args={[0x8899aa, 200, 800]} />

      <GroundPlane />
      <Trees />
      <DistantHills />
    </>
  );
}
