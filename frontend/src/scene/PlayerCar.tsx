import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const DRIVER_EYE_HEIGHT = 1.22;
const DASH_Y = 0.62;
const DASH_Z = 0.7;

function CockpitInterior() {
  const dashboardShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.92, 0);
    shape.quadraticCurveTo(-0.92, 0.25, -0.6, 0.3);
    shape.lineTo(0.6, 0.3);
    shape.quadraticCurveTo(0.92, 0.25, 0.92, 0);
    shape.lineTo(0.92, -0.06);
    shape.lineTo(-0.92, -0.06);
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
    <group position={[0, DASH_Y, DASH_Z]}>
      <mesh geometry={dashGeometry} rotation={[0.15, 0, 0]}>
        <meshStandardMaterial color={0x1a1a1a} roughness={0.88} metalness={0.05} />
      </mesh>

      {/* Instrument cluster behind steering wheel */}
      <mesh position={[-0.32, 0.2, 0.06]} rotation={[-0.35, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.015, 32]} />
        <meshStandardMaterial
          color={0x0a0a0a}
          emissive={0x001122}
          emissiveIntensity={0.2}
          roughness={0.2}
          metalness={0.05}
        />
      </mesh>

      {/* Center infotainment screen */}
      <mesh position={[0.22, 0.24, 0.04]} rotation={[-0.22, 0, 0]}>
        <boxGeometry args={[0.42, 0.26, 0.015]} />
        <meshStandardMaterial
          color={0x080808}
          emissive={0x0a1830}
          emissiveIntensity={0.15}
          roughness={0.08}
          metalness={0.02}
        />
      </mesh>

      {/* Steering wheel -- angled toward driver, left side (LHD US car) */}
      <group position={[-0.33, 0.28, -0.08]} rotation={[-0.52, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.17, 0.014, 8, 32]} />
          <meshStandardMaterial color={0x222222} roughness={0.65} metalness={0.25} />
        </mesh>
        {/* Steering wheel hub */}
        <mesh>
          <cylinderGeometry args={[0.04, 0.04, 0.012, 16]} />
          <meshStandardMaterial color={0x333333} roughness={0.5} metalness={0.35} />
        </mesh>
        {/* Spokes */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.3, 0.012, 0.018]} />
          <meshStandardMaterial color={0x292929} roughness={0.7} metalness={0.2} />
        </mesh>
        <mesh rotation={[Math.PI / 2, Math.PI / 2, 0]}>
          <boxGeometry args={[0.22, 0.012, 0.018]} />
          <meshStandardMaterial color={0x292929} roughness={0.7} metalness={0.2} />
        </mesh>
        {/* Steering column */}
        <mesh position={[0, -0.12, 0.06]} rotation={[0.3, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
          <meshStandardMaterial color={0x1a1a1a} roughness={0.8} metalness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

function DoorPanels() {
  const panelShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, 0.55);
    shape.quadraticCurveTo(0.05, 0.75, 0.15, 0.8);
    shape.lineTo(0.8, 0.8);
    shape.lineTo(0.8, 0);
    shape.closePath();
    return shape;
  }, []);

  const panelGeometry = useMemo(() => {
    return new THREE.ExtrudeGeometry(panelShape, {
      depth: 0.03,
      bevelEnabled: false,
    });
  }, [panelShape]);

  return (
    <>
      {/* Left door panel */}
      <mesh geometry={panelGeometry} position={[-0.96, 0.2, -0.3]} rotation={[0, Math.PI / 2, 0]}>
        <meshStandardMaterial color={0x181818} roughness={0.92} metalness={0.03} />
      </mesh>
      {/* Right door panel */}
      <mesh geometry={panelGeometry} position={[0.96, 0.2, -0.3]} rotation={[0, -Math.PI / 2, 0]}>
        <meshStandardMaterial color={0x181818} roughness={0.92} metalness={0.03} />
      </mesh>
    </>
  );
}

function HoodSurface() {
  return (
    <mesh position={[0, 0.68, 1.6]} rotation={[-0.06, 0, 0]} receiveShadow>
      <boxGeometry args={[1.72, 0.035, 2.0]} />
      <meshStandardMaterial
        color={0x222222}
        metalness={0.6}
        roughness={0.3}
        envMapIntensity={0.8}
      />
    </mesh>
  );
}

function APillar() {
  return (
    <>
      {/* Left A-pillar: diagonal from lower-left dash to upper windshield */}
      <mesh position={[-0.9, 1.02, 1.1]} rotation={[0.5, 0.06, 0.1]}>
        <boxGeometry args={[0.055, 0.72, 0.055]} />
        <meshStandardMaterial color={0x151515} roughness={0.9} metalness={0.05} />
      </mesh>
      {/* Right A-pillar */}
      <mesh position={[0.9, 1.02, 1.1]} rotation={[0.5, -0.06, -0.1]}>
        <boxGeometry args={[0.055, 0.72, 0.055]} />
        <meshStandardMaterial color={0x151515} roughness={0.9} metalness={0.05} />
      </mesh>
      {/* Roof header (connects A-pillars at top) */}
      <mesh position={[0, 1.4, 0.6]}>
        <boxGeometry args={[1.8, 0.04, 0.06]} />
        <meshStandardMaterial color={0x111111} roughness={0.92} metalness={0.03} />
      </mesh>
    </>
  );
}

export function PlayerCar() {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const eulerRef = useRef(new THREE.Euler());

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(camera.position.x, 0, camera.position.z);

      eulerRef.current.setFromQuaternion(camera.quaternion, "YXZ");
      groupRef.current.rotation.set(0, eulerRef.current.y, 0);
    }
  });

  return (
    <group ref={groupRef}>
      <CockpitInterior />
      <DoorPanels />
      <HoodSurface />
      <APillar />
    </group>
  );
}
