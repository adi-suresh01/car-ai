import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

const LANE_COUNT = 5;
const SIGN_SPACING = 400;
const BARRIER_SEGMENT_LENGTH = 1200;

function HighwaySign({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 7, 8]} />
        <meshStandardMaterial color={0x666666} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 6.5, 0]}>
        <boxGeometry args={[2.5, 1.5, 0.08]} />
        <meshStandardMaterial color={0x006633} roughness={0.6} />
      </mesh>
      <mesh position={[0, 6.5, 0.05]}>
        <boxGeometry args={[2.2, 1.2, 0.01]} />
        <meshStandardMaterial
          color={0xffffff}
          emissive={0xffffff}
          emissiveIntensity={0.15}
        />
      </mesh>
    </group>
  );
}

function ConcreteBarriers() {
  const playerZ = useSimulationStore((s) => s.player.positionZ);
  const groupRef = useRef<THREE.Group>(null);

  const barrierProfile = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.45, 0);
    shape.lineTo(0.35, 0.3);
    shape.lineTo(0.15, 0.8);
    shape.lineTo(-0.15, 0.8);
    shape.lineTo(-0.35, 0.3);
    shape.lineTo(-0.45, 0);
    shape.closePath();
    return shape;
  }, []);

  const barrierGeometry = useMemo(() => {
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: BARRIER_SEGMENT_LENGTH,
      bevelEnabled: false,
    };
    const geom = new THREE.ExtrudeGeometry(barrierProfile, extrudeSettings);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, 0, -BARRIER_SEGMENT_LENGTH / 2);
    return geom;
  }, [barrierProfile]);

  const medianX = (LANE_COUNT * PHYSICS.LANE_WIDTH_METERS) / 2;

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.z = -(playerZ % BARRIER_SEGMENT_LENGTH);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={barrierGeometry} position={[-2.5, 0, 0]} receiveShadow castShadow>
        <meshStandardMaterial color={0x999999} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh
        geometry={barrierGeometry}
        position={[LANE_COUNT * PHYSICS.LANE_WIDTH_METERS + 2.5, 0, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={0x999999} roughness={0.85} metalness={0.05} />
      </mesh>
    </group>
  );
}

export function Scenery() {
  const roadRight = LANE_COUNT * PHYSICS.LANE_WIDTH_METERS + 5;

  const signPositions = useMemo((): [number, number, number][] => {
    return [
      [roadRight + 2, 0, -200],
      [roadRight + 2, 0, 200],
    ];
  }, [roadRight]);

  return (
    <group>
      <ConcreteBarriers />
      {signPositions.map((pos, i) => (
        <HighwaySign key={i} position={pos} />
      ))}
    </group>
  );
}
