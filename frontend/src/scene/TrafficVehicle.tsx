import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { InterpolatedVehicle } from "../state/simulationStore";
import { useSimulationStore } from "../state/simulationStore";
import type { VehicleType, NPCBehavior } from "../models/types";
import { PHYSICS, NPC_BEHAVIOR_COLORS } from "../models/types";

interface VehicleProfile {
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  cabinHeight: number;
  cabinSetback: number;
  cabinLength: number;
  wheelRadius: number;
  wheelWidth: number;
  color: THREE.Color;
  cabinTint: THREE.Color;
}

const VEHICLE_PROFILES: Record<VehicleType, VehicleProfile> = {
  sedan: {
    bodyLength: 4.6,
    bodyWidth: 1.85,
    bodyHeight: 0.45,
    cabinHeight: 0.65,
    cabinSetback: 0.6,
    cabinLength: 2.4,
    wheelRadius: 0.33,
    wheelWidth: 0.22,
    color: new THREE.Color(0.25, 0.35, 0.55),
    cabinTint: new THREE.Color(0.12, 0.15, 0.2),
  },
  suv: {
    bodyLength: 4.9,
    bodyWidth: 2.0,
    bodyHeight: 0.6,
    cabinHeight: 0.8,
    cabinSetback: 0.3,
    cabinLength: 3.0,
    wheelRadius: 0.4,
    wheelWidth: 0.26,
    color: new THREE.Color(0.5, 0.5, 0.55),
    cabinTint: new THREE.Color(0.15, 0.15, 0.18),
  },
  truck: {
    bodyLength: 5.8,
    bodyWidth: 2.1,
    bodyHeight: 0.7,
    cabinHeight: 0.9,
    cabinSetback: 0.2,
    cabinLength: 2.2,
    wheelRadius: 0.42,
    wheelWidth: 0.28,
    color: new THREE.Color(0.7, 0.65, 0.55),
    cabinTint: new THREE.Color(0.2, 0.18, 0.15),
  },
  "sports-car": {
    bodyLength: 4.4,
    bodyWidth: 1.9,
    bodyHeight: 0.35,
    cabinHeight: 0.5,
    cabinSetback: 0.8,
    cabinLength: 1.8,
    wheelRadius: 0.3,
    wheelWidth: 0.24,
    color: new THREE.Color(0.8, 0.15, 0.1),
    cabinTint: new THREE.Color(0.1, 0.1, 0.1),
  },
  motorcycle: {
    bodyLength: 2.2,
    bodyWidth: 0.6,
    bodyHeight: 0.5,
    cabinHeight: 0.4,
    cabinSetback: 0.2,
    cabinLength: 0.8,
    wheelRadius: 0.32,
    wheelWidth: 0.14,
    color: new THREE.Color(0.2, 0.2, 0.2),
    cabinTint: new THREE.Color(0.12, 0.12, 0.12),
  },
};

const LOD_NEAR = 100;
const LOD_FAR = 350;
const CULL_DISTANCE = 600;

function createBodyShape(profile: VehicleProfile): THREE.Shape {
  const hw = profile.bodyWidth / 2;
  const hl = profile.bodyLength / 2;
  const r = 0.2;

  const shape = new THREE.Shape();
  shape.moveTo(-hl + r, -hw);
  shape.lineTo(hl - r * 2, -hw);
  shape.quadraticCurveTo(hl, -hw, hl, -hw + r);
  shape.lineTo(hl, hw - r);
  shape.quadraticCurveTo(hl, hw, hl - r * 2, hw);
  shape.lineTo(-hl + r, hw);
  shape.quadraticCurveTo(-hl, hw, -hl, hw - r);
  shape.lineTo(-hl, -hw + r);
  shape.quadraticCurveTo(-hl, -hw, -hl + r, -hw);

  return shape;
}

function createCabinShape(profile: VehicleProfile): THREE.Shape {
  const hw = (profile.bodyWidth * 0.85) / 2;
  const frontOffset = profile.cabinSetback;
  const hl = profile.cabinLength / 2;
  const front = hl - frontOffset * 0.5;
  const back = -hl;

  const shape = new THREE.Shape();
  shape.moveTo(back, -hw * 0.9);
  shape.lineTo(front * 0.7, -hw);
  shape.quadraticCurveTo(front, -hw * 0.6, front, 0);
  shape.quadraticCurveTo(front, hw * 0.6, front * 0.7, hw);
  shape.lineTo(back, hw * 0.9);
  shape.lineTo(back, -hw * 0.9);

  return shape;
}

function getBehaviorTint(behavior: NPCBehavior | undefined): THREE.Color {
  if (!behavior) return new THREE.Color(1, 1, 1);
  const cfg = NPC_BEHAVIOR_COLORS[behavior];
  return new THREE.Color(cfg.body);
}

function getBehaviorEmissive(behavior: NPCBehavior | undefined): number {
  if (!behavior) return 0;
  return NPC_BEHAVIOR_COLORS[behavior].emissive;
}

function ProceduralCarFull({ profile, behavior }: { profile: VehicleProfile; behavior?: NPCBehavior }) {
  const behaviorTint = useMemo(() => getBehaviorTint(behavior), [behavior]);
  const behaviorEmissive = useMemo(() => getBehaviorEmissive(behavior), [behavior]);

  const bodyColor = useMemo(() => {
    if (!behavior) return profile.color;
    return profile.color.clone().lerp(behaviorTint, 0.35);
  }, [profile, behavior, behaviorTint]);

  const bodyGeometry = useMemo(() => {
    const shape = createBodyShape(profile);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: profile.bodyHeight,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 3,
    };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, profile.wheelRadius + 0.1, 0);
    return geom;
  }, [profile]);

  const cabinGeometry = useMemo(() => {
    const shape = createCabinShape(profile);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: profile.cabinHeight,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.08,
      bevelSegments: 4,
    };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.rotateX(-Math.PI / 2);
    geom.translate(
      -profile.cabinSetback * 0.3,
      profile.wheelRadius + 0.1 + profile.bodyHeight,
      0
    );
    return geom;
  }, [profile]);

  const wheelGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(
      profile.wheelRadius,
      profile.wheelRadius,
      profile.wheelWidth,
      16
    );
  }, [profile]);

  const wheelPositions = useMemo(() => {
    const axleSpread = profile.bodyWidth / 2 + 0.02;
    const frontAxle = profile.bodyLength * 0.3;
    const rearAxle = -profile.bodyLength * 0.28;
    return [
      [frontAxle, profile.wheelRadius, axleSpread],
      [frontAxle, profile.wheelRadius, -axleSpread],
      [rearAxle, profile.wheelRadius, axleSpread],
      [rearAxle, profile.wheelRadius, -axleSpread],
    ] as [number, number, number][];
  }, [profile]);

  const headlightPositions = useMemo(() => {
    const front = profile.bodyLength / 2 - 0.05;
    const spread = profile.bodyWidth * 0.35;
    const height = profile.wheelRadius + 0.1 + profile.bodyHeight * 0.5;
    return [
      [front, height, spread],
      [front, height, -spread],
    ] as [number, number, number][];
  }, [profile]);

  const taillightPositions = useMemo(() => {
    const rear = -profile.bodyLength / 2 + 0.05;
    const spread = profile.bodyWidth * 0.35;
    const height = profile.wheelRadius + 0.1 + profile.bodyHeight * 0.5;
    return [
      [rear, height, spread],
      [rear, height, -spread],
    ] as [number, number, number][];
  }, [profile]);

  return (
    <group>
      <mesh geometry={bodyGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={bodyColor}
          emissive={behaviorEmissive}
          emissiveIntensity={behavior ? 0.2 : 0}
          metalness={0.35}
          roughness={0.4}
          envMapIntensity={0.8}
        />
      </mesh>

      <mesh geometry={cabinGeometry} castShadow>
        <meshPhysicalMaterial
          color={profile.cabinTint}
          metalness={0.1}
          roughness={0.05}
          transmission={0.4}
          thickness={0.3}
          envMapIntensity={0.8}
        />
      </mesh>

      {wheelPositions.map((pos, i) => (
        <mesh
          key={i}
          geometry={wheelGeometry}
          position={pos}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <meshStandardMaterial
            color={0x1a1a1a}
            metalness={0.3}
            roughness={0.8}
          />
        </mesh>
      ))}

      {headlightPositions.map((pos, i) => (
        <group key={`hl-${i}`} position={pos}>
          <mesh>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial
              color={0xfff8e0}
              emissive={0xfff8e0}
              emissiveIntensity={2.0}
            />
          </mesh>
          <pointLight color={0xfff8e0} intensity={0.3} distance={15} />
        </group>
      ))}

      {taillightPositions.map((pos, i) => (
        <group key={`tl-${i}`} position={pos}>
          <mesh>
            <boxGeometry args={[0.04, 0.08, 0.16]} />
            <meshStandardMaterial
              color={0xff1a1a}
              emissive={0xff1a1a}
              emissiveIntensity={3.0}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ProceduralCarSimple({ profile, behavior }: { profile: VehicleProfile; behavior?: NPCBehavior }) {
  const behaviorTint = useMemo(() => getBehaviorTint(behavior), [behavior]);
  const behaviorEmissive = useMemo(() => getBehaviorEmissive(behavior), [behavior]);

  const bodyColor = useMemo(() => {
    if (!behavior) return profile.color;
    return profile.color.clone().lerp(behaviorTint, 0.35);
  }, [profile, behavior, behaviorTint]);

  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[profile.bodyLength, profile.bodyHeight + profile.cabinHeight, profile.bodyWidth]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={behaviorEmissive}
          emissiveIntensity={behavior ? 0.15 : 0}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
    </group>
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
}

function TrafficVehicleSingle({ vehicle, playerZ, isTopDown }: TrafficVehicleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const profile = VEHICLE_PROFILES[vehicle.type] || VEHICLE_PROFILES.sedan;
  const posRef = useRef({ laneX: 0, relZ: 0, headingAngle: 0 });

  useFrame(() => {
    const store = useSimulationStore.getState();
    const laneCount = store.routeGeometry?.laneCount ?? 4;
    const halfRoad = (laneCount * PHYSICS.LANE_WIDTH_METERS) / 2;
    const relativeZ = vehicle.position[2] - playerZ;
    const laneX = (vehicle.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad;
    posRef.current.laneX = laneX;
    posRef.current.relZ = relativeZ;
    posRef.current.headingAngle = Math.atan2(vehicle.heading[0], vehicle.heading[2]);

    if (groupRef.current) {
      groupRef.current.position.set(laneX, 0, relativeZ);
      groupRef.current.rotation.y = posRef.current.headingAngle;
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
        <ProceduralCarSimple profile={profile} behavior={vehicle.behavior} />
      ) : (
        <ProceduralCarFull profile={profile} behavior={vehicle.behavior} />
      )}
      {isTopDown && vehicle.behavior && (
        <BehaviorIndicator behavior={vehicle.behavior} height={vehicleHeight} />
      )}
    </group>
  );
}

export function TrafficVehicle({ vehicle, playerZ }: { vehicle: InterpolatedVehicle; playerZ: number }) {
  return <TrafficVehicleSingle vehicle={vehicle} playerZ={playerZ} isTopDown={false} />;
}

export function TrafficVehicles() {
  const vehiclesRef = useRef<InterpolatedVehicle[]>([]);
  const playerZRef = useRef(0);

  useFrame(() => {
    const store = useSimulationStore.getState();
    vehiclesRef.current = store.vehicles;
    playerZRef.current = store.player.positionZ;
  });

  const vehicles = useSimulationStore((s) => s.vehicles);
  const playerZ = useSimulationStore((s) => s.player.positionZ);
  const viewMode = useSimulationStore((s) => s.viewMode);
  const isTopDown = viewMode === "topdown";

  return (
    <>
      {vehicles.map((v) => (
        <TrafficVehicleSingle
          key={v.id}
          vehicle={v}
          playerZ={playerZ}
          isTopDown={isTopDown}
        />
      ))}
    </>
  );
}

export { VEHICLE_PROFILES, type VehicleProfile };
