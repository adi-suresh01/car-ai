import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { InterpolatedVehicle } from "../state/simulationStore";
import { useSimulationStore } from "../state/simulationStore";
import type { VehicleType } from "../models/types";
import { PHYSICS } from "../models/types";

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
    color: new THREE.Color(0.18, 0.22, 0.32),
    cabinTint: new THREE.Color(0.08, 0.1, 0.14),
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
    color: new THREE.Color(0.35, 0.35, 0.38),
    cabinTint: new THREE.Color(0.12, 0.12, 0.14),
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
    color: new THREE.Color(0.6, 0.58, 0.52),
    cabinTint: new THREE.Color(0.15, 0.14, 0.12),
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
    color: new THREE.Color(0.65, 0.12, 0.08),
    cabinTint: new THREE.Color(0.08, 0.08, 0.08),
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
    color: new THREE.Color(0.15, 0.15, 0.15),
    cabinTint: new THREE.Color(0.1, 0.1, 0.1),
  },
};

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

function ProceduralCar({ profile }: { profile: VehicleProfile }) {
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
          color={profile.color}
          metalness={0.7}
          roughness={0.25}
          envMapIntensity={1.2}
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

interface TrafficVehicleProps {
  vehicle: InterpolatedVehicle;
  playerZ: number;
}

export function TrafficVehicle({ vehicle, playerZ }: TrafficVehicleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const profile = VEHICLE_PROFILES[vehicle.type] || VEHICLE_PROFILES.sedan;

  const relativeZ = vehicle.position[2] - playerZ;
  const laneX = vehicle.laneIndex * PHYSICS.LANE_WIDTH_METERS;

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(laneX, 0, relativeZ);
      const headingAngle = Math.atan2(vehicle.heading[0], vehicle.heading[2]);
      groupRef.current.rotation.y = headingAngle;
    }
  });

  if (Math.abs(relativeZ) > 600) return null;

  return (
    <group ref={groupRef}>
      <ProceduralCar profile={profile} />
    </group>
  );
}

export function TrafficVehicles() {
  const vehicles = useSimulationStore((s) => s.vehicles);
  const playerZ = useSimulationStore((s) => s.player.positionZ);

  return (
    <>
      {vehicles.map((v) => (
        <TrafficVehicle key={v.id} vehicle={v} playerZ={playerZ} />
      ))}
    </>
  );
}
