import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import {
  sampleSpline,
  buildRoadMesh,
  buildLaneMarkings,
  interpolateSampleAtS,
  type SplineSample,
} from "./roadSpline";
import type { RouteGeometry, RouteControlPoint } from "../models/types";

const TREE_COUNT = 400;

interface RoadGeometryState {
  samples: SplineSample[];
  geometry: RouteGeometry;
}

// Default road so there's always something to render
function defaultRouteGeometry(): RouteGeometry {
  const controlPoints: RouteControlPoint[] = [];
  let x = 0, z = 0, heading = 0, s = 0;
  const segs = [
    [200, 0], [150, 0.004], [100, 0], [180, -0.005], [120, 0],
    [200, 0.003], [80, 0], [160, -0.008], [100, 0], [140, 0.006],
    [200, 0], [250, -0.003], [100, 0], [180, 0.01], [80, 0],
    [120, -0.012], [160, 0], [200, 0.004], [140, 0], [180, -0.006],
    [200, 0], [160, 0.008], [120, 0], [200, -0.004], [300, 0],
  ];
  for (const [len, curv] of segs) {
    const steps = Math.ceil(len / 10);
    for (let i = 0; i < steps; i++) {
      controlPoints.push({ x, z, heading, curvature: curv, s });
      heading += curv * 10;
      x += Math.sin(heading) * 10;
      z += Math.cos(heading) * 10;
      s += 10;
    }
  }
  controlPoints.push({ x, z, heading, curvature: 0, s });
  return { controlPoints, laneCount: 4, laneWidth: 3.6, totalLength: s, speedLimits: [{ s: 0, speedMph: 65 }] };
}

const DEFAULT_ROUTE = defaultRouteGeometry();

function useRoadGeometry(): RoadGeometryState {
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  // Ensure the store always has route geometry so CameraController can use it
  useEffect(() => {
    if (!useSimulationStore.getState().routeGeometry) {
      useSimulationStore.getState().setRouteGeometry(DEFAULT_ROUTE);
    }
  }, []);

  return useMemo(() => {
    const geo = routeGeometry ?? DEFAULT_ROUTE;
    const samples = sampleSpline(geo);
    return { samples, geometry: geo };
  }, [routeGeometry]);
}

/* -------------------------------------------------------------------------- */
/*  RoadSurface — darkened asphalt with PBR textures                          */
/* -------------------------------------------------------------------------- */

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
        roughness={0.92}
        metalness={0}
        color={0x444444}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/*  LaneMarkings — simple white, no emissive glow                            */
/* -------------------------------------------------------------------------- */

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
            color={0xeeeeee}
            emissive={0x000000}
            emissiveIntensity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {dashedGeometries.map((geom, i) => (
        <mesh key={`dashed-${i}`} geometry={geom}>
          <meshStandardMaterial
            color={0xdddddd}
            emissive={0x000000}
            emissiveIntensity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  RollingTerrain — subdivided plane with multi-octave vertex displacement   */
/* -------------------------------------------------------------------------- */

function RollingTerrain({ samples }: { samples: SplineSample[] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const terrainGeom = useMemo(() => {
    const size = 2400;
    const segments = 128;
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    geom.rotateX(-Math.PI / 2);

    const positions = geom.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);

      // Multi-octave sinusoidal noise for gentle rolling hills
      const freq1 = 0.002;
      const freq2 = 0.008;
      const freq3 = 0.02;
      const h1 = Math.sin(x * freq1 + 1.3) * Math.cos(z * freq1 + 0.7) * 25;
      const h2 = Math.sin(x * freq2 + 5.1) * Math.cos(z * freq2 + 2.3) * 8;
      const h3 = Math.sin(x * freq3) * Math.cos(z * freq3 + 4.1) * 2;
      positions.setY(i, h1 + h2 + h3 - 1.5);
    }

    geom.computeVertexNormals();
    return geom;
  }, []);

  // Lush grass-green DataTexture
  const groundTexture = useMemo(() => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const noise = Math.random() * 20;
      const idx = i * 4;
      // Warm green tones
      data[idx] = 50 + noise * 0.8;       // R
      data[idx + 1] = 90 + noise * 1.3;   // G
      data[idx + 2] = 30 + noise * 0.4;   // B
      data[idx + 3] = 255;                 // A
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(150, 150);
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

  return (
    <mesh ref={meshRef} geometry={terrainGeom} receiveShadow>
      <meshStandardMaterial
        map={groundTexture}
        color={0x4a7a30}
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/*  GrassVerge — organic transition strips along both road edges              */
/* -------------------------------------------------------------------------- */

function GrassVerge({ samples, geometry }: RoadGeometryState) {
  const groupRef = useRef<THREE.Group>(null);

  const vergeGeom = useMemo(() => {
    if (samples.length < 2) return null;

    const laneCount = geometry.laneCount;
    const laneWidth = geometry.laneWidth;
    const halfRoadWidth = (laneCount * laneWidth) / 2;
    const vergeWidth = 1.8;
    const vergeHeight = 0.04; // 4cm raised above road

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const step = 2;

    for (let side = -1; side <= 1; side += 2) {
      const baseVertIdx = positions.length / 3;
      let segCount = 0;

      for (let i = 0; i < samples.length; i += step) {
        const s = samples[i];
        // Inner edge: at road boundary
        const innerDist = halfRoadWidth * side;
        const innerX = s.position.x + s.normal.x * innerDist;
        const innerZ = s.position.z + s.normal.z * innerDist;
        // Outer edge: road boundary + verge width
        const outerDist = (halfRoadWidth + vergeWidth) * side;
        const outerX = s.position.x + s.normal.x * outerDist;
        const outerZ = s.position.z + s.normal.z * outerDist;

        const v = i / (samples.length - 1);

        // Inner vertex
        positions.push(innerX, vergeHeight, innerZ);
        normals.push(0, 1, 0);
        uvs.push(0, v * 100);

        // Outer vertex
        positions.push(outerX, vergeHeight, outerZ);
        normals.push(0, 1, 0);
        uvs.push(1, v * 100);

        if (segCount > 0) {
          const idx = baseVertIdx + segCount * 2;
          const prev = idx - 2;
          indices.push(prev, prev + 1, idx + 1);
          indices.push(prev, idx + 1, idx);
        }
        segCount++;
      }
    }

    const bufferGeom = new THREE.BufferGeometry();
    bufferGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    bufferGeom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    bufferGeom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    bufferGeom.setIndex(indices);
    return bufferGeom;
  }, [samples, geometry]);

  // Bright grass texture for the verge
  const vergeTexture = useMemo(() => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const noise = Math.random() * 15;
      const idx = i * 4;
      data[idx] = 55 + noise;          // R
      data[idx + 1] = 110 + noise * 2; // G
      data[idx + 2] = 35 + noise * 0.5; // B
      data[idx + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 200);
    tex.needsUpdate = true;
    return tex;
  }, []);

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

  if (!vergeGeom) return null;

  return (
    <group ref={groupRef}>
      <mesh geometry={vergeGeom} receiveShadow>
        <meshStandardMaterial
          map={vergeTexture}
          color={0x5a9a35}
          roughness={0.95}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  RoadsideTrees — 400 mixed trees: conifer, deciduous, birch               */
/* -------------------------------------------------------------------------- */

// Seeded random utility (deterministic per index)
function seededRandom(seed: number, n: number): number {
  const x = Math.sin(seed + n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// Tree type enum
const TREE_CONIFER = 0;
const TREE_DECIDUOUS = 1;
const TREE_BIRCH = 2;

interface TreeInstance {
  position: THREE.Vector3;
  scale: number;
  trunkHeight: number;
  treeType: number;
}

function RoadsideTrees({ samples, geometry }: RoadGeometryState) {
  const groupRef = useRef<THREE.Group>(null);

  const treeData = useMemo((): TreeInstance[] => {
    const halfWidth = (geometry.laneCount * geometry.laneWidth) / 2;
    const trees: TreeInstance[] = [];
    const seed = 42;

    for (let i = 0; i < TREE_COUNT; i++) {
      const sampleIdx = Math.floor(seededRandom(seed, i * 5) * samples.length);
      const sample = samples[Math.min(sampleIdx, samples.length - 1)];
      const side = seededRandom(seed, i * 5 + 1) > 0.5 ? 1 : -1;
      // Trees close to road: min 4m from road edge, max ~40m out
      const dist = halfWidth + 4 + seededRandom(seed, i * 5 + 2) * 36;

      const pos = new THREE.Vector3(
        sample.position.x + sample.normal.x * dist * side,
        0,
        sample.position.z + sample.normal.z * dist * side
      );

      // Type distribution: 60% conifer, 25% deciduous, 15% birch
      const typeRoll = seededRandom(seed, i * 5 + 3);
      let treeType: number;
      if (typeRoll < 0.6) {
        treeType = TREE_CONIFER;
      } else if (typeRoll < 0.85) {
        treeType = TREE_DECIDUOUS;
      } else {
        treeType = TREE_BIRCH;
      }

      const scale = 0.7 + seededRandom(seed, i * 5 + 4) * 0.8;

      let trunkHeight: number;
      if (treeType === TREE_CONIFER) {
        trunkHeight = 2 + seededRandom(seed, i * 11) * 2.5;
      } else if (treeType === TREE_DECIDUOUS) {
        trunkHeight = 2 + seededRandom(seed, i * 11) * 1.5;
      } else {
        trunkHeight = 3 + seededRandom(seed, i * 11) * 2;
      }

      trees.push({ position: pos, scale, trunkHeight, treeType });
    }

    return trees;
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
      {treeData.map((tree, i) => {
        switch (tree.treeType) {
          case TREE_CONIFER:
            return <ConiferTree key={i} tree={tree} />;
          case TREE_DECIDUOUS:
            return <DeciduousTree key={i} tree={tree} />;
          case TREE_BIRCH:
            return <BirchTree key={i} tree={tree} />;
          default:
            return <ConiferTree key={i} tree={tree} />;
        }
      })}
    </group>
  );
}

/* --- Conifer: 3-layer cone foliage, dark green --- */

function ConiferTree({ tree }: { tree: TreeInstance }) {
  return (
    <group
      position={[tree.position.x, tree.position.y, tree.position.z]}
      scale={tree.scale}
    >
      {/* Trunk */}
      <mesh position={[0, tree.trunkHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.2, tree.trunkHeight, 6]} />
        <meshStandardMaterial color={0x5a422a} roughness={0.92} />
      </mesh>
      {/* Bottom foliage — widest layer */}
      <mesh position={[0, tree.trunkHeight + 2.0, 0]} castShadow>
        <coneGeometry args={[2.0, 4, 8]} />
        <meshStandardMaterial color={0x1a4a1a} roughness={0.88} />
      </mesh>
      {/* Middle foliage */}
      <mesh position={[0, tree.trunkHeight + 4.0, 0]} castShadow>
        <coneGeometry args={[1.5, 3.2, 8]} />
        <meshStandardMaterial color={0x1e551e} roughness={0.88} />
      </mesh>
      {/* Top foliage — narrowest, tip */}
      <mesh position={[0, tree.trunkHeight + 5.6, 0]} castShadow>
        <coneGeometry args={[0.9, 2.4, 7]} />
        <meshStandardMaterial color={0x2a5a2a} roughness={0.85} />
      </mesh>
    </group>
  );
}

/* --- Deciduous: round-topped with icosahedron foliage --- */

function DeciduousTree({ tree }: { tree: TreeInstance }) {
  return (
    <group
      position={[tree.position.x, tree.position.y, tree.position.z]}
      scale={tree.scale}
    >
      {/* Trunk */}
      <mesh position={[0, tree.trunkHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.25, tree.trunkHeight, 6]} />
        <meshStandardMaterial color={0x5a422a} roughness={0.92} />
      </mesh>
      {/* Main canopy — rounded blob */}
      <mesh position={[0, tree.trunkHeight + 2.2, 0]} castShadow>
        <icosahedronGeometry args={[2.8, 1]} />
        <meshStandardMaterial color={0x3a6a2a} roughness={0.88} />
      </mesh>
      {/* Secondary canopy offset slightly */}
      <mesh position={[0.6, tree.trunkHeight + 3.0, 0.4]} castShadow>
        <icosahedronGeometry args={[1.8, 1]} />
        <meshStandardMaterial color={0x2e5e24} roughness={0.88} />
      </mesh>
    </group>
  );
}

/* --- Birch: white trunk, small light-green canopy --- */

function BirchTree({ tree }: { tree: TreeInstance }) {
  return (
    <group
      position={[tree.position.x, tree.position.y, tree.position.z]}
      scale={tree.scale}
    >
      {/* White birch trunk — thin */}
      <mesh position={[0, tree.trunkHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, tree.trunkHeight, 6]} />
        <meshStandardMaterial color={0xd8d0c0} roughness={0.75} />
      </mesh>
      {/* Canopy — airy, light green */}
      <mesh position={[0, tree.trunkHeight + 1.8, 0]} castShadow>
        <icosahedronGeometry args={[2.0, 1]} />
        <meshStandardMaterial color={0x5a8a3a} roughness={0.85} />
      </mesh>
      {/* Secondary tuft */}
      <mesh position={[-0.5, tree.trunkHeight + 2.8, 0.3]} castShadow>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshStandardMaterial color={0x68964a} roughness={0.85} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Road — main export composing all sub-components                           */
/* -------------------------------------------------------------------------- */

export function Road() {
  const roadState = useRoadGeometry();

  return (
    <group>
      <RollingTerrain samples={roadState.samples} />
      <RoadSurface {...roadState} />
      <LaneMarkings {...roadState} />
      <GrassVerge {...roadState} />
      <RoadsideTrees {...roadState} />
    </group>
  );
}

export { useRoadGeometry, type RoadGeometryState };
