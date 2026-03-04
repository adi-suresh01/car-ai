import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { InterpolatedVehicle } from "../state/simulationStore";
import { useSimulationStore } from "../state/simulationStore";
import type { VehicleType, NPCBehavior } from "../models/types";
import { PHYSICS, NPC_BEHAVIOR_COLORS } from "../models/types";
import { sampleSpline, interpolateSampleAtS, type SplineSample } from "./roadSpline";

// Preload all vehicle models
const MODEL_PATHS: Record<VehicleType, string> = {
  sedan: "/models/sedan.glb",
  suv: "/models/suv.glb",
  truck: "/models/truck.glb",
  "sports-car": "/models/sports-car.glb",
  motorcycle: "/models/sedan.glb", // fallback
};

for (const path of Object.values(MODEL_PATHS)) {
  useGLTF.preload(path);
}

interface VehicleProfile {
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  cabinHeight: number;
  wheelRadius: number;
}

const VEHICLE_PROFILES: Record<VehicleType, VehicleProfile> = {
  sedan: { bodyLength: 4.6, bodyWidth: 1.85, bodyHeight: 0.45, cabinHeight: 0.65, wheelRadius: 0.33 },
  suv: { bodyLength: 4.9, bodyWidth: 2.0, bodyHeight: 0.6, cabinHeight: 0.8, wheelRadius: 0.4 },
  truck: { bodyLength: 5.8, bodyWidth: 2.1, bodyHeight: 0.7, cabinHeight: 0.9, wheelRadius: 0.42 },
  "sports-car": { bodyLength: 4.4, bodyWidth: 1.9, bodyHeight: 0.35, cabinHeight: 0.5, wheelRadius: 0.3 },
  motorcycle: { bodyLength: 2.2, bodyWidth: 0.6, bodyHeight: 0.5, cabinHeight: 0.4, wheelRadius: 0.32 },
};

const LOD_FAR = 350;
const CULL_DISTANCE = 600;

function getBehaviorTint(behavior: NPCBehavior | undefined): THREE.Color {
  if (!behavior) return new THREE.Color(1, 1, 1);
  const cfg = NPC_BEHAVIOR_COLORS[behavior];
  return new THREE.Color(cfg.body);
}

function GLTFVehicle({ type, behavior }: { type: VehicleType; behavior?: NPCBehavior }) {
  const { scene } = useGLTF(MODEL_PATHS[type] || MODEL_PATHS.sedan);
  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    if (behavior) {
      const tint = getBehaviorTint(behavior);
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = (child.material as THREE.MeshStandardMaterial).clone();
          if (mat.name.includes("Body")) {
            mat.color.lerp(tint, 0.35);
            mat.emissive.copy(tint);
            mat.emissiveIntensity = 0.15;
          }
          child.material = mat;
        }
      });
    }
    return clone;
  }, [scene, behavior]);

  return <primitive object={cloned} />;
}

function SimpleBox({ profile, behavior }: { profile: VehicleProfile; behavior?: NPCBehavior }) {
  const color = useMemo(() => {
    const base = new THREE.Color(0.4, 0.4, 0.45);
    if (behavior) base.lerp(getBehaviorTint(behavior), 0.35);
    return base;
  }, [behavior]);

  const totalH = profile.wheelRadius + profile.bodyHeight + profile.cabinHeight;
  return (
    <mesh castShadow position={[0, totalH / 2, 0]}>
      <boxGeometry args={[profile.bodyWidth, totalH, profile.bodyLength]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
    </mesh>
  );
}

function BehaviorIndicator({ behavior, height }: { behavior: NPCBehavior; height: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cfg = NPC_BEHAVIOR_COLORS[behavior];

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 1.5;
    }
  });

  return (
    <group position={[0, height + 1.2, 0]}>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.25, 0]} />
        <meshStandardMaterial
          color={cfg.body}
          emissive={cfg.emissive}
          emissiveIntensity={0.8}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  );
}

interface TrafficVehicleProps {
  vehicle: InterpolatedVehicle;
  playerZ: number;
  isTopDown: boolean;
  samples: SplineSample[];
}

function TrafficVehicleSingle({ vehicle, playerZ, isTopDown, samples }: TrafficVehicleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const profile = VEHICLE_PROFILES[vehicle.type] || VEHICLE_PROFILES.sedan;

  useFrame(() => {
    const store = useSimulationStore.getState();
    const laneCount = store.routeGeometry?.laneCount ?? 4;
    const halfRoad = (laneCount * PHYSICS.LANE_WIDTH_METERS) / 2;
    const relativeZ = vehicle.position[2] - playerZ;
    const lateralPos = (vehicle.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad;

    if (!groupRef.current) return;

    // Use spline-based positioning so NPCs follow road curves
    if (samples.length > 0) {
      const posS = store.playerPositionS;
      const vehicleS = posS + relativeZ;
      const maxS = samples[samples.length - 1].s;
      const clampedS = Math.max(0, Math.min(vehicleS, maxS));
      const sample = interpolateSampleAtS(samples, clampedS);

      // Position on the road: spline center + lateral offset along normal
      const worldX = sample.position.x + sample.normal.x * lateralPos;
      const worldZ = sample.position.z + sample.normal.z * lateralPos;

      // Offset by player's world position to keep relative to camera
      const playerS = posS;
      const playerSample = interpolateSampleAtS(samples, playerS);
      const offsetX = worldX - playerSample.position.x;
      const offsetZ = worldZ - playerSample.position.z;

      groupRef.current.position.set(offsetX, 0, offsetZ);

      // Rotate to follow road tangent direction
      const roadHeading = Math.atan2(sample.tangent.x, sample.tangent.z);
      // GLTF model faces -Z, add PI so it faces along +tangent
      groupRef.current.rotation.y = roadHeading + Math.PI;
    } else {
      // Fallback: straight-line positioning
      const laneX = (vehicle.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad;
      groupRef.current.position.set(laneX, 0, relativeZ);
      const headingAngle = Math.atan2(vehicle.heading[0], vehicle.heading[2]);
      groupRef.current.rotation.y = headingAngle + Math.PI;
    }
  });

  const relativeZ = vehicle.position[2] - playerZ;
  const dist = Math.abs(relativeZ);

  if (dist > CULL_DISTANCE) return null;

  const useLOD = dist > LOD_FAR;
  const vehicleHeight = profile.wheelRadius + profile.bodyHeight + profile.cabinHeight;

  return (
    <group ref={groupRef}>
      {useLOD ? (
        <SimpleBox profile={profile} behavior={vehicle.behavior} />
      ) : (
        <GLTFVehicle type={vehicle.type} behavior={vehicle.behavior} />
      )}
      {isTopDown && vehicle.behavior && (
        <BehaviorIndicator behavior={vehicle.behavior} height={vehicleHeight} />
      )}
    </group>
  );
}

export function TrafficVehicle({ vehicle, playerZ }: { vehicle: InterpolatedVehicle; playerZ: number }) {
  return <TrafficVehicleSingle vehicle={vehicle} playerZ={playerZ} isTopDown={false} samples={[]} />;
}

export function TrafficVehicles() {
  const vehicles = useSimulationStore((s) => s.vehicles);
  const playerZ = useSimulationStore((s) => s.player.positionZ);
  const viewMode = useSimulationStore((s) => s.viewMode);
  const routeGeometry = useSimulationStore((s) => s.routeGeometry);
  const isTopDown = viewMode === "topdown";

  // Build spline samples once for all vehicles
  const samples = useMemo(() => {
    if (!routeGeometry) return [];
    return sampleSpline(routeGeometry);
  }, [routeGeometry]);

  return (
    <>
      {vehicles.map((v) => (
        <TrafficVehicleSingle
          key={v.id}
          vehicle={v}
          playerZ={playerZ}
          isTopDown={isTopDown}
          samples={samples}
        />
      ))}
    </>
  );
}

export { VEHICLE_PROFILES, type VehicleProfile };
