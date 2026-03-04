import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";
import {
  sampleSpline,
  interpolateSampleAtS,
  buildRoadMesh,
  buildLaneMarkings,
  type SplineSample,
} from "./roadSpline";
import type { InterpolatedVehicle } from "../state/simulationStore";

const TOP_DOWN_HEIGHT = 60;
const VISIBLE_RANGE = 500;

function TopDownCamera() {
  const { camera } = useThree();
  const samplesRef = useRef<SplineSample[]>([]);
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  if (routeGeometry && samplesRef.current.length === 0) {
    samplesRef.current = sampleSpline(routeGeometry);
  }

  useFrame(() => {
    const store = useSimulationStore.getState();
    const posS = store.playerPositionS;
    const samples = samplesRef.current;

    if (samples.length > 0) {
      const sample = interpolateSampleAtS(samples, posS);
      // Small look-ahead so the player car isn't dead center
      const lookAhead = 15;
      const targetX = sample.position.x + sample.tangent.x * lookAhead;
      const targetZ = sample.position.z + sample.tangent.z * lookAhead;

      camera.position.set(targetX, TOP_DOWN_HEIGHT, targetZ);
      camera.lookAt(targetX, 0, targetZ);

      // Set camera.up to road tangent so road ALWAYS appears straight on screen
      // This prevents the "crooked" markers on curves
      camera.up.set(sample.tangent.x, 0, sample.tangent.z).normalize();
    }
  });

  return null;
}

function TacticalRoad() {
  const samplesRef = useRef<SplineSample[]>([]);
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  if (routeGeometry && samplesRef.current.length === 0) {
    samplesRef.current = sampleSpline(routeGeometry);
  }

  const roadGeom = useMemo(() => {
    const samples = samplesRef.current;
    if (samples.length < 2 || !routeGeometry) return null;

    const meshData = buildRoadMesh(samples, routeGeometry.laneCount, routeGeometry.laneWidth);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
    geom.setAttribute("uv", new THREE.BufferAttribute(meshData.uvs, 2));
    geom.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    return geom;
  }, [samplesRef.current.length, routeGeometry]);

  const markingGeoms = useMemo(() => {
    const samples = samplesRef.current;
    if (samples.length < 2 || !routeGeometry) return { solid: [], dashed: [] };

    const markings = buildLaneMarkings(samples, routeGeometry.laneCount, routeGeometry.laneWidth);

    const buildGeom = (data: { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array }) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
      geom.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
      geom.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
      geom.setIndex(new THREE.BufferAttribute(data.indices, 1));
      return geom;
    };

    return {
      solid: markings.solid.map(buildGeom),
      dashed: markings.dashed.map(buildGeom),
    };
  }, [samplesRef.current.length, routeGeometry]);

  if (!roadGeom) return null;

  return (
    <group>
      <mesh geometry={roadGeom}>
        <meshStandardMaterial
          color={0x2a2e36}
          roughness={0.9}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {markingGeoms.solid.map((geom, i) => (
        <mesh key={`solid-${i}`} geometry={geom}>
          <meshStandardMaterial
            color={0xffdd44}
            emissive={0xffaa00}
            emissiveIntensity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {markingGeoms.dashed.map((geom, i) => (
        <mesh key={`dashed-${i}`} geometry={geom}>
          <meshStandardMaterial
            color={0xffffff}
            emissive={0xcccccc}
            emissiveIntensity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function TacticalTerrain() {
  const samplesRef = useRef<SplineSample[]>([]);
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  if (routeGeometry && samplesRef.current.length === 0) {
    samplesRef.current = sampleSpline(routeGeometry);
  }

  const terrainGeom = useMemo(() => {
    const samples = samplesRef.current;
    if (samples.length < 2) return null;
    const center = samples[Math.floor(samples.length / 2)].position;
    const half = 1200;
    const cx = center.x;
    const cz = center.z;
    const positions = new Float32Array([
      cx - half, -0.1, cz - half,
      cx + half, -0.1, cz - half,
      cx + half, -0.1, cz + half,
      cx - half, -0.1, cz + half,
    ]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    return geom;
  }, [samplesRef.current.length]);

  if (!terrainGeom) return null;

  return (
    <mesh geometry={terrainGeom}>
      <meshStandardMaterial color={0x1a3312} roughness={1} metalness={0} />
    </mesh>
  );
}

function PlayerMarker() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);
  const samplesRef = useRef<SplineSample[]>([]);
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  if (routeGeometry && samplesRef.current.length === 0) {
    samplesRef.current = sampleSpline(routeGeometry);
  }

  useFrame((_, delta) => {
    timeRef.current += delta;
    const store = useSimulationStore.getState();
    const player = store.player;
    const posS = store.playerPositionS;
    const samples = samplesRef.current;
    const laneCount = store.routeGeometry?.laneCount ?? 4;
    const halfRoad = (laneCount * PHYSICS.LANE_WIDTH_METERS) / 2;
    const lateralPos = (player.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad + player.lateralOffset;

    if (samples.length > 0) {
      const sample = interpolateSampleAtS(samples, posS);
      const roadHeading = Math.atan2(sample.tangent.x, sample.tangent.z);
      const posX = sample.position.x + sample.normal.x * lateralPos;
      const posZ = sample.position.z + sample.normal.z * lateralPos;

      if (groupRef.current) {
        groupRef.current.position.set(posX, 0.5, posZ);
        // Align to road tangent — since camera.up also follows tangent,
        // this will always appear "straight up" on screen
        groupRef.current.rotation.y = -roadHeading;
      }
      if (glowRef.current) {
        glowRef.current.position.set(posX, 0.2, posZ);
        const pulse = 1 + Math.sin(timeRef.current * 3) * 0.15;
        glowRef.current.scale.setScalar(pulse);
      }
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* Car body — wider, flatter for clear lane visibility */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[2.2, 0.5, 4.8]} />
          <meshStandardMaterial
            color={0x0088ff}
            emissive={0x0066cc}
            emissiveIntensity={0.6}
          />
        </mesh>
        {/* Direction arrow — front of car */}
        <mesh position={[0, 0.6, 1.8]}>
          <coneGeometry args={[0.6, 1.2, 3]} />
          <meshStandardMaterial
            color={0x00ddff}
            emissive={0x00bbff}
            emissiveIntensity={1.0}
          />
        </mesh>
      </group>
      {/* Glow ring */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 5, 24]} />
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

function NPCMarkers() {
  const vehicles = useSimulationStore((s) => s.vehicles);
  const samplesRef = useRef<SplineSample[]>([]);
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);

  if (routeGeometry && samplesRef.current.length === 0) {
    samplesRef.current = sampleSpline(routeGeometry);
  }

  return (
    <>
      {vehicles.map((v) => (
        <NPCSingleMarker key={v.id} vehicle={v} samples={samplesRef.current} />
      ))}
    </>
  );
}

function NPCSingleMarker({ vehicle, samples }: { vehicle: InterpolatedVehicle; samples: SplineSample[] }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const playerZ = store.player.positionZ;
    const posS = store.playerPositionS;
    const relZ = vehicle.position[2] - playerZ;

    if (Math.abs(relZ) > VISIBLE_RANGE) {
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    if (groupRef.current) groupRef.current.visible = true;

    const laneCount = store.routeGeometry?.laneCount ?? 4;
    const halfRoad = (laneCount * PHYSICS.LANE_WIDTH_METERS) / 2;
    const lateralPos = (vehicle.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad;

    if (samples.length > 0) {
      const vehicleS = posS + relZ;
      const clampedS = Math.max(0, Math.min(vehicleS, samples[samples.length - 1].s));
      const sample = interpolateSampleAtS(samples, clampedS);
      const posX = sample.position.x + sample.normal.x * lateralPos;
      const posZ = sample.position.z + sample.normal.z * lateralPos;
      const roadHeading = Math.atan2(sample.tangent.x, sample.tangent.z);

      if (groupRef.current) {
        groupRef.current.position.set(posX, 0.3, posZ);
        // Align to road tangent — matches camera.up, so always appears straight
        groupRef.current.rotation.y = -roadHeading;
      }
    }
  });

  const color = vehicle.behavior === "aggressive" ? 0xff4422
    : vehicle.behavior === "defensive" ? 0x44aa44
    : 0xff8833;

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[2.0, 0.5, 4.4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* Small front indicator */}
      <mesh position={[0, 0.4, 1.8]}>
        <boxGeometry args={[1.4, 0.2, 0.3]} />
        <meshStandardMaterial
          color={0xffffcc}
          emissive={0xffffaa}
          emissiveIntensity={0.6}
        />
      </mesh>
    </group>
  );
}

function TopDownScene() {
  return (
    <>
      <TopDownCamera />
      <ambientLight intensity={0.5} color={0xaabbdd} />
      <directionalLight position={[0, 200, 50]} intensity={0.6} color={0xffffff} />
      <TacticalTerrain />
      <TacticalRoad />
      <PlayerMarker />
      <NPCMarkers />
    </>
  );
}

export function TopDownView() {
  return (
    <Canvas
      orthographic
      camera={{
        zoom: 8,
        near: 0.1,
        far: 500,
        position: [0, TOP_DOWN_HEIGHT, 0],
        up: [0, 0, 1],
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0e14",
      }}
      frameloop="always"
      performance={{ min: 0.5 }}
    >
      <TopDownScene />
    </Canvas>
  );
}
