import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import {
  sampleSpline,
  buildRoadMesh,
  buildLaneMarkings,
  buildGuardrailPositions,
  buildTreePositions,
  generateMockRouteGeometry,
  generateMockDirections,
  generateMockRouteSummary,
  interpolateSampleAtS,
  type SplineSample,
} from "./roadSpline";
import type { RouteGeometry } from "../models/types";

const TREE_COUNT = 200;
const GUARDRAIL_SPACING = 4;

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
  texture.repeat.set(4, 60);
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
  texture.repeat.set(4, 60);
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
  texture.repeat.set(4, 60);
  texture.needsUpdate = true;
  return texture;
}

interface RoadGeometryState {
  samples: SplineSample[];
  geometry: RouteGeometry;
}

function useRoadGeometry(): RoadGeometryState {
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  return useMemo(() => {
    const geo = routeGeometry ?? generateMockRouteGeometry();
    const samples = sampleSpline(geo);
    return { samples, geometry: geo };
  }, [routeGeometry]);
}

function RoadSurface({ samples, geometry }: RoadGeometryState) {
  const meshRef = useRef<THREE.Mesh>(null);
  const playerOriginRef = useRef(new THREE.Vector3());

  const textures = useMemo(() => ({
    diffuse: createAsphaltTexture(),
    normal: createNormalTexture(),
    roughness: createRoughnessTexture(),
  }), []);

  const roadBufferGeom = useMemo(() => {
    const meshData = buildRoadMesh(samples, geometry.laneCount, geometry.laneWidth);
    const bufferGeom = new THREE.BufferGeometry();
    bufferGeom.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
    bufferGeom.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
    bufferGeom.setAttribute("uv", new THREE.BufferAttribute(meshData.uvs, 2));
    bufferGeom.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    return bufferGeom;
  }, [samples, geometry]);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;
    const interpSample = interpolateSampleAtS(samples, posS);

    playerOriginRef.current.copy(interpSample.position);

    if (meshRef.current) {
      meshRef.current.position.set(
        -playerOriginRef.current.x,
        0,
        -playerOriginRef.current.z
      );
    }
  });

  return (
    <mesh ref={meshRef} geometry={roadBufferGeom} receiveShadow>
      <meshStandardMaterial
        map={textures.diffuse}
        normalMap={textures.normal}
        roughnessMap={textures.roughness}
        roughness={0.85}
        metalness={0.05}
        color={0x4a4a4a}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

function LaneMarkings({ samples, geometry }: RoadGeometryState) {
  const groupRef = useRef<THREE.Group>(null);

  const markings = useMemo(
    () => buildLaneMarkings(samples, geometry.laneCount, geometry.laneWidth),
    [samples, geometry]
  );

  const solidGeometries = useMemo(() => {
    return markings.solid.map((strip) => {
      const bufferGeom = new THREE.BufferGeometry();
      bufferGeom.setAttribute("position", new THREE.BufferAttribute(strip.positions, 3));
      bufferGeom.setAttribute("normal", new THREE.BufferAttribute(strip.normals, 3));
      bufferGeom.setAttribute("uv", new THREE.BufferAttribute(strip.uvs, 2));
      bufferGeom.setIndex(new THREE.BufferAttribute(strip.indices, 1));
      return bufferGeom;
    });
  }, [markings]);

  const dashedGeometries = useMemo(() => {
    return markings.dashed.map((strip) => {
      const bufferGeom = new THREE.BufferGeometry();
      bufferGeom.setAttribute("position", new THREE.BufferAttribute(strip.positions, 3));
      bufferGeom.setAttribute("normal", new THREE.BufferAttribute(strip.normals, 3));
      bufferGeom.setAttribute("uv", new THREE.BufferAttribute(strip.uvs, 2));
      bufferGeom.setIndex(new THREE.BufferAttribute(strip.indices, 1));
      return bufferGeom;
    });
  }, [markings]);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;
    const interpSample = interpolateSampleAtS(samples, posS);

    if (groupRef.current) {
      groupRef.current.position.set(
        -interpSample.position.x,
        0,
        -interpSample.position.z
      );
    }
  });

  return (
    <group ref={groupRef}>
      {solidGeometries.map((geom, i) => (
        <mesh key={`solid-${i}`} geometry={geom}>
          <meshStandardMaterial
            color={0xffdd44}
            emissive={0xffaa00}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
      {dashedGeometries.map((geom, i) => (
        <mesh key={`dashed-${i}`} geometry={geom}>
          <meshStandardMaterial
            color={0xffffff}
            emissive={0xcccccc}
            emissiveIntensity={0.3}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function GuardRails({ samples, geometry }: RoadGeometryState) {
  const leftMeshRef = useRef<THREE.InstancedMesh>(null);
  const rightMeshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const railData = useMemo(
    () => buildGuardrailPositions(samples, geometry.laneCount, geometry.laneWidth, GUARDRAIL_SPACING),
    [samples, geometry]
  );

  const postGeom = useMemo(() => new THREE.BoxGeometry(0.1, 0.8, 0.1), []);

  useEffect(() => {
    if (leftMeshRef.current) {
      railData.left.forEach((matrix, i) => {
        leftMeshRef.current!.setMatrixAt(i, matrix);
      });
      leftMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (rightMeshRef.current) {
      railData.right.forEach((matrix, i) => {
        rightMeshRef.current!.setMatrixAt(i, matrix);
      });
      rightMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [railData]);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;
    const interpSample = interpolateSampleAtS(samples, posS);

    if (groupRef.current) {
      groupRef.current.position.set(
        -interpSample.position.x,
        0,
        -interpSample.position.z
      );
    }
  });

  const maxCount = Math.max(railData.left.length, railData.right.length, 1);

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={leftMeshRef}
        args={[postGeom, undefined, maxCount]}
        count={railData.left.length}
      >
        <meshStandardMaterial color={0x888888} metalness={0.8} roughness={0.3} />
      </instancedMesh>
      <instancedMesh
        ref={rightMeshRef}
        args={[postGeom, undefined, maxCount]}
        count={railData.right.length}
      >
        <meshStandardMaterial color={0x888888} metalness={0.8} roughness={0.3} />
      </instancedMesh>
    </group>
  );
}

function RoadsideTrees({ samples, geometry }: RoadGeometryState) {
  const groupRef = useRef<THREE.Group>(null);

  const treeData = useMemo(
    () => buildTreePositions(samples, geometry.laneCount, geometry.laneWidth, TREE_COUNT, 42),
    [samples, geometry]
  );

  useFrame(() => {
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;
    const interpSample = interpolateSampleAtS(samples, posS);

    if (groupRef.current) {
      groupRef.current.position.set(
        -interpSample.position.x,
        0,
        -interpSample.position.z
      );
    }
  });

  return (
    <group ref={groupRef}>
      {treeData.map((tree, i) => (
        <group key={i} position={[tree.position.x, tree.position.y, tree.position.z]} scale={tree.scale}>
          {/* Trunk */}
          <mesh position={[0, tree.trunkHeight / 2, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.22, tree.trunkHeight, 6]} />
            <meshStandardMaterial color={0x5a422a} roughness={0.92} />
          </mesh>
          {/* Bottom foliage -- widest layer, positioned so base sits at trunk top */}
          <mesh position={[0, tree.trunkHeight + 2.0, 0]} castShadow>
            <coneGeometry args={[2.0, 4, 8]} />
            <meshStandardMaterial color={0x1a5a1a} roughness={0.88} />
          </mesh>
          {/* Middle foliage */}
          <mesh position={[0, tree.trunkHeight + 4.0, 0]} castShadow>
            <coneGeometry args={[1.5, 3.2, 8]} />
            <meshStandardMaterial color={0x226622} roughness={0.88} />
          </mesh>
          {/* Top foliage -- narrowest, tip of tree */}
          <mesh position={[0, tree.trunkHeight + 5.6, 0]} castShadow>
            <coneGeometry args={[0.9, 2.4, 7]} />
            <meshStandardMaterial color={0x2a7a2a} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TerrainPlane({ samples }: { samples: SplineSample[] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const groundTexture = useMemo(() => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const noise = Math.random() * 18;
      const idx = i * 4;
      data[idx] = 32 + noise;
      data[idx + 1] = 50 + noise * 1.2;
      data[idx + 2] = 24 + noise * 0.6;
      data[idx + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(120, 120);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;
    const interpSample = interpolateSampleAtS(samples, posS);

    if (meshRef.current) {
      meshRef.current.position.set(
        -interpSample.position.x,
        -0.2,
        -interpSample.position.z
      );
    }
  });

  const terrainGeom = useMemo(() => {
    if (samples.length < 2) {
      const geom = new THREE.BufferGeometry();
      const h = 1200;
      const positions = new Float32Array([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h]);
      const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
      const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geom.setIndex(new THREE.BufferAttribute(indices, 1));
      return geom;
    }

    const center = samples[Math.floor(samples.length / 2)].position;
    const geom = new THREE.BufferGeometry();
    const half = 1200;
    const cx = center.x;
    const cz = center.z;
    const positions = new Float32Array([
      cx - half, 0, cz - half,
      cx + half, 0, cz - half,
      cx + half, 0, cz + half,
      cx - half, 0, cz + half,
    ]);
    const normals = new Float32Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ]);
    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    return geom;
  }, [samples]);

  return (
    <mesh ref={meshRef} geometry={terrainGeom} receiveShadow>
      <meshStandardMaterial
        map={groundTexture}
        color={0x2a4518}
        roughness={0.97}
        metalness={0}
      />
    </mesh>
  );
}

export function Road() {
  const roadState = useRoadGeometry();

  useEffect(() => {
    const store = useSimulationStore.getState();
    if (!store.routeGeometry) {
      const mockGeo = generateMockRouteGeometry();
      const mockDirs = generateMockDirections(mockGeo);
      const mockSummary = generateMockRouteSummary(mockGeo, mockDirs);
      store.setRouteGeometry(mockGeo);
      store.setRouteDirections(mockDirs);
      store.setRouteSummary(mockSummary);
    }
  }, []);

  return (
    <group>
      <TerrainPlane samples={roadState.samples} />
      <RoadSurface {...roadState} />
      <LaneMarkings {...roadState} />
      <GuardRails {...roadState} />
      <RoadsideTrees {...roadState} />
    </group>
  );
}

export { useRoadGeometry, type RoadGeometryState };
