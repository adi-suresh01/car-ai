import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
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

  const [diffuse, normal, roughness] = useTexture([
    "/textures/asphalt-diffuse.jpg",
    "/textures/asphalt-normal.jpg",
    "/textures/asphalt-roughness.jpg",
  ]);

  useMemo(() => {
    for (const tex of [diffuse, normal, roughness]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 60);
    }
  }, [diffuse, normal, roughness]);

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
        map={diffuse}
        normalMap={normal}
        roughnessMap={roughness}
        roughness={0.85}
        metalness={0.05}
        color={0x555555}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
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
            emissiveIntensity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {dashedGeometries.map((geom, i) => (
        <mesh key={`dashed-${i}`} geometry={geom}>
          <meshStandardMaterial
            color={0xffffff}
            emissive={0xeeeeee}
            emissiveIntensity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function GuardRails({ samples, geometry }: RoadGeometryState) {
  const groupRef = useRef<THREE.Group>(null);

  // Build continuous barrier geometry along the road edges
  const { leftBarrier, rightBarrier } = useMemo(() => {
    const laneCount = geometry.laneCount;
    const laneWidth = geometry.laneWidth;
    const halfWidth = (laneCount * laneWidth) / 2 + 1.5;
    const barrierHeight = 0.75;
    const barrierThickness = 0.12;
    const postWidth = 0.1;
    const postSpacing = 4; // meters between posts
    const railY = 0.45; // height of horizontal rail

    function buildBarrierGeometry(side: number) {
      const positions: number[] = [];
      const normals: number[] = [];
      const indices: number[] = [];

      // Horizontal rail — continuous strip along road
      const step = 2;
      const railVerts: number[] = [];
      const railNorms: number[] = [];
      const railIdx: number[] = [];

      for (let i = 0; i < samples.length; i += step) {
        const s = samples[i];
        const nx = s.normal.x * halfWidth * side;
        const nz = s.normal.z * halfWidth * side;
        const bx = s.position.x + nx;
        const bz = s.position.z + nz;

        // Outward normal for the barrier face
        const outX = s.normal.x * side;
        const outZ = s.normal.z * side;

        const idx = railVerts.length / 3;

        // Bottom of rail (inner face)
        railVerts.push(bx, railY - barrierThickness, bz);
        railNorms.push(-outX, 0, -outZ);
        // Top of rail (inner face)
        railVerts.push(bx, railY + barrierThickness, bz);
        railNorms.push(-outX, 0, -outZ);
        // Bottom of rail (outer face)
        railVerts.push(bx + outX * barrierThickness, railY - barrierThickness, bz + outZ * barrierThickness);
        railNorms.push(outX, 0, outZ);
        // Top of rail (outer face)
        railVerts.push(bx + outX * barrierThickness, railY + barrierThickness, bz + outZ * barrierThickness);
        railNorms.push(outX, 0, outZ);

        // Top face
        railVerts.push(bx, railY + barrierThickness, bz);
        railNorms.push(0, 1, 0);
        railVerts.push(bx + outX * barrierThickness, railY + barrierThickness, bz + outZ * barrierThickness);
        railNorms.push(0, 1, 0);

        if (i > 0) {
          const prev = idx - 6;
          // Inner face quad
          railIdx.push(prev, prev + 1, idx + 1, prev, idx + 1, idx);
          // Outer face quad
          railIdx.push(prev + 2, idx + 2, idx + 3, prev + 2, idx + 3, prev + 3);
          // Top face quad
          railIdx.push(prev + 4, idx + 4, idx + 5, prev + 4, idx + 5, prev + 5);
        }
      }

      positions.push(...railVerts);
      normals.push(...railNorms);
      indices.push(...railIdx);

      // Posts — vertical elements at intervals
      const postBaseIdx = positions.length / 3;
      let postCount = 0;

      for (let i = 0; i < samples.length; i += Math.round(postSpacing / 2)) {
        const s = samples[i];
        const nx = s.normal.x * halfWidth * side;
        const nz = s.normal.z * halfWidth * side;
        const cx = s.position.x + nx;
        const cz = s.position.z + nz;

        // Post is a vertical box
        const hw = postWidth / 2;
        const hd = postWidth / 2;
        const baseY = 0.05;
        const topY = barrierHeight;

        const tx = s.tangent.x;
        const tz = s.tangent.z;

        const idx = positions.length / 3;

        // Front face (toward road)
        positions.push(cx - tx * hd, baseY, cz - tz * hd);
        positions.push(cx - tx * hd, topY, cz - tz * hd);
        positions.push(cx + tx * hd, topY, cz + tz * hd);
        positions.push(cx + tx * hd, baseY, cz + tz * hd);
        for (let n = 0; n < 4; n++) normals.push(-s.normal.x * side, 0, -s.normal.z * side);
        indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);

        // Outer face
        const oIdx = positions.length / 3;
        const ox = s.normal.x * side * postWidth;
        const oz = s.normal.z * side * postWidth;
        positions.push(cx - tx * hd + ox, baseY, cz - tz * hd + oz);
        positions.push(cx - tx * hd + ox, topY, cz - tz * hd + oz);
        positions.push(cx + tx * hd + ox, topY, cz + tz * hd + oz);
        positions.push(cx + tx * hd + ox, baseY, cz + tz * hd + oz);
        for (let n = 0; n < 4; n++) normals.push(s.normal.x * side, 0, s.normal.z * side);
        indices.push(oIdx, oIdx + 2, oIdx + 1, oIdx, oIdx + 3, oIdx + 2);

        postCount++;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geom.setIndex(indices);
      return geom;
    }

    return {
      leftBarrier: buildBarrierGeometry(1),
      rightBarrier: buildBarrierGeometry(-1),
    };
  }, [samples, geometry]);

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
      <mesh geometry={leftBarrier}>
        <meshStandardMaterial color={0x707070} metalness={0.7} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightBarrier}>
        <meshStandardMaterial color={0x707070} metalness={0.7} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
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
