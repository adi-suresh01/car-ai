import { useMemo } from "react";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

function CockpitInterior() {
  const dashboardShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.9, 0);
    shape.quadraticCurveTo(-0.9, 0.35, -0.6, 0.4);
    shape.lineTo(0.6, 0.4);
    shape.quadraticCurveTo(0.9, 0.35, 0.9, 0);
    shape.lineTo(0.9, -0.05);
    shape.lineTo(-0.9, -0.05);
    shape.closePath();
    return shape;
  }, []);

  const dashGeometry = useMemo(() => {
    const settings: THREE.ExtrudeGeometryOptions = {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    };
    return new THREE.ExtrudeGeometry(dashboardShape, settings);
  }, [dashboardShape]);

  return (
    <group position={[0, 0.75, 0.3]}>
      <mesh geometry={dashGeometry} rotation={[0.15, 0, 0]} position={[0, 0, 0]}>
        <meshStandardMaterial color={0x1a1a1a} roughness={0.85} metalness={0.1} />
      </mesh>

      <mesh position={[-0.35, 0.2, -0.1]} rotation={[-0.3, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.02, 32]} />
        <meshStandardMaterial
          color={0x111111}
          emissive={0x001122}
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      <mesh position={[0.25, 0.25, -0.05]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[0.45, 0.28, 0.03]} />
        <meshStandardMaterial
          color={0x0a0a0a}
          emissive={0x112244}
          emissiveIntensity={0.2}
          roughness={0.1}
          metalness={0.05}
        />
      </mesh>

      <group position={[-0.35, 0.45, -0.15]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.18, 0.015, 8, 32]} />
          <meshStandardMaterial color={0x222222} roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.04, 0.04, 0.015, 16]} />
          <meshStandardMaterial color={0x333333} roughness={0.5} metalness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function DoorPanels() {
  const panelShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, 0.6);
    shape.quadraticCurveTo(0.05, 0.8, 0.2, 0.85);
    shape.lineTo(0.8, 0.85);
    shape.lineTo(0.8, 0);
    shape.closePath();
    return shape;
  }, []);

  const panelGeometry = useMemo(() => {
    return new THREE.ExtrudeGeometry(panelShape, {
      depth: 0.04,
      bevelEnabled: false,
    });
  }, [panelShape]);

  return (
    <>
      <mesh geometry={panelGeometry} position={[-0.92, 0.3, -0.5]} rotation={[0, Math.PI / 2, 0]}>
        <meshStandardMaterial color={0x1a1a1a} roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh geometry={panelGeometry} position={[0.92, 0.3, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <meshStandardMaterial color={0x1a1a1a} roughness={0.9} metalness={0.05} />
      </mesh>
    </>
  );
}

export function PlayerCar() {
  const laneIndex = useSimulationStore((s) => s.player.laneIndex);
  const lateralOffset = useSimulationStore((s) => s.player.lateralOffset);

  const posX = laneIndex * PHYSICS.LANE_WIDTH_METERS + lateralOffset;

  return (
    <group position={[posX, 0, 0]}>
      <CockpitInterior />
      <DoorPanels />
    </group>
  );
}
