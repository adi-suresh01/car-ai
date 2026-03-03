import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

const ROAD_LENGTH = 1200;
const ROAD_SEGMENT_COUNT = 60;
const LANE_COUNT = 5;
const TOTAL_ROAD_WIDTH = LANE_COUNT * PHYSICS.LANE_WIDTH_METERS + 4;

function createAsphaltTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    const noise = Math.random() * 20 - 10;
    const base = 42 + noise;
    const idx = i * 4;
    data[idx] = base;
    data[idx + 1] = base + 2;
    data[idx + 2] = base + 4;
    data[idx + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, ROAD_LENGTH / 8);
  texture.needsUpdate = true;
  return texture;
}

function createNormalTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    data[idx] = 128 + (Math.random() - 0.5) * 30;
    data[idx + 1] = 128 + (Math.random() - 0.5) * 30;
    data[idx + 2] = 255;
    data[idx + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, ROAD_LENGTH / 8);
  texture.needsUpdate = true;
  return texture;
}

function createRoughnessTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    const v = 180 + Math.random() * 40;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, ROAD_LENGTH / 8);
  texture.needsUpdate = true;
  return texture;
}

function LaneMarkings() {
  const groupRef = useRef<THREE.Group>(null);
  const playerZ = useSimulationStore((s) => s.player.positionZ);

  const markingGeometry = useMemo(() => {
    return new THREE.PlaneGeometry(0.15, 3);
  }, []);

  const solidGeometry = useMemo(() => {
    return new THREE.PlaneGeometry(0.15, ROAD_LENGTH);
  }, []);

  const dashPositions = useMemo(() => {
    const positions: number[] = [];
    for (let z = -ROAD_LENGTH / 2; z < ROAD_LENGTH / 2; z += 9) {
      positions.push(z);
    }
    return positions;
  }, []);

  useFrame(() => {
    if (groupRef.current) {
      const offsetZ = Math.floor(playerZ / 9) * 9;
      groupRef.current.position.z = -offsetZ;
    }
  });

  const laneEdges = useMemo(() => {
    const edges: { x: number; isDashed: boolean }[] = [];
    for (let i = 0; i <= LANE_COUNT; i++) {
      const x = i * PHYSICS.LANE_WIDTH_METERS;
      const isEdge = i === 0 || i === LANE_COUNT;
      edges.push({ x, isDashed: !isEdge });
    }
    return edges;
  }, []);

  return (
    <group ref={groupRef} position={[0, 0.02, 0]}>
      {laneEdges.map((edge, edgeIdx) =>
        edge.isDashed ? (
          dashPositions.map((z, dashIdx) => (
            <mesh
              key={`d-${edgeIdx}-${dashIdx}`}
              geometry={markingGeometry}
              position={[edge.x, 0, z]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <meshStandardMaterial
                color={0xffffff}
                emissive={0xcccccc}
                emissiveIntensity={0.3}
                transparent
                opacity={0.85}
              />
            </mesh>
          ))
        ) : (
          <mesh
            key={`s-${edgeIdx}`}
            geometry={solidGeometry}
            position={[edge.x, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <meshStandardMaterial
              color={0xffdd44}
              emissive={0xffaa00}
              emissiveIntensity={0.5}
            />
          </mesh>
        )
      )}
    </group>
  );
}

function GuardRails() {
  const playerZ = useSimulationStore((s) => s.player.positionZ);
  const groupRef = useRef<THREE.Group>(null);

  const postGeometry = useMemo(() => {
    return new THREE.BoxGeometry(0.1, 0.8, 0.1);
  }, []);

  const railGeometry = useMemo(() => {
    return new THREE.BoxGeometry(0.05, 0.12, ROAD_LENGTH);
  }, []);

  const postPositions = useMemo(() => {
    const positions: number[] = [];
    for (let z = -ROAD_LENGTH / 2; z < ROAD_LENGTH / 2; z += 4) {
      positions.push(z);
    }
    return positions;
  }, []);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.z = -Math.floor(playerZ / 4) * 4;
    }
  });

  const leftX = -1.2;
  const rightX = LANE_COUNT * PHYSICS.LANE_WIDTH_METERS + 1.2;

  return (
    <group ref={groupRef}>
      <mesh geometry={railGeometry} position={[leftX, 0.65, 0]}>
        <meshStandardMaterial color={0x888888} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh geometry={railGeometry} position={[rightX, 0.65, 0]}>
        <meshStandardMaterial color={0x888888} metalness={0.8} roughness={0.3} />
      </mesh>

      {postPositions.map((z, i) => (
        <group key={i}>
          <mesh geometry={postGeometry} position={[leftX, 0.4, z]}>
            <meshStandardMaterial color={0x666666} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh geometry={postGeometry} position={[rightX, 0.4, z]}>
            <meshStandardMaterial color={0x666666} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Road() {
  const roadRef = useRef<THREE.Mesh>(null);
  const playerZ = useSimulationStore((s) => s.player.positionZ);

  const textures = useMemo(() => {
    return {
      diffuse: createAsphaltTexture(),
      normal: createNormalTexture(),
      roughness: createRoughnessTexture(),
    };
  }, []);

  useFrame(() => {
    if (textures.diffuse) {
      textures.diffuse.offset.y = -playerZ / 8;
      textures.normal.offset.y = -playerZ / 8;
      textures.roughness.offset.y = -playerZ / 8;
    }
  });

  const roadCenter = (LANE_COUNT * PHYSICS.LANE_WIDTH_METERS) / 2;

  return (
    <group>
      <mesh
        ref={roadRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[roadCenter, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[TOTAL_ROAD_WIDTH, ROAD_LENGTH, ROAD_SEGMENT_COUNT, 1]} />
        <meshStandardMaterial
          map={textures.diffuse}
          normalMap={textures.normal}
          roughnessMap={textures.roughness}
          roughness={0.85}
          metalness={0.05}
          color={0x3a3a3a}
        />
      </mesh>

      <LaneMarkings />
      <GuardRails />
    </group>
  );
}
