import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ── All positions are camera-relative (camera = driver's eyes at origin) ──
// Negative Y = below eye level, negative Z = in front of driver

// Dashboard fills bottom ~40% of view, close to driver
const DASH_TOP_Y = -0.38; // top edge of dashboard
const DASH_Z = -0.42; // how far forward
const DASH_WIDTH = 1.95;
const DASH_DEPTH = 0.65;
const DASH_THICK = 0.15;

// Steering wheel — large and close for immersion
const SW_X = -0.30; // left of center (LHD)
const SW_Y = -0.32;
const SW_Z = -0.34;
const SW_RADIUS = 0.185;
const SW_TILT = -0.42; // tilted toward driver

// A-pillars — thick enough to frame the view
const PILLAR_W = 0.86;

// Materials (shared singletons)
const mats = {
  dash: new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.92, metalness: 0.05 }),
  dashTop: new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.85, metalness: 0.03 }),
  darkTrim: new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.9, metalness: 0.02 }),
  steering: new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.6, metalness: 0.12 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.15, metalness: 0.92 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0a1828, emissive: 0x0a2848, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.08 }),
  cluster: new THREE.MeshStandardMaterial({ color: 0x060608, emissive: 0x152540, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.05 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
  roof: new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.96, metalness: 0.0 }),
  vent: new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.7, metalness: 0.3 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x121215, roughness: 0.98, metalness: 0.0 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.75, metalness: 0.02 }),
  redGlow: new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.25, roughness: 0.5, transparent: true, opacity: 0.6 }),
  doorPanel: new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.88, metalness: 0.03 }),
};

function SteeringWheel() {
  return (
    <group position={[SW_X, SW_Y, SW_Z]} rotation={[SW_TILT, 0, 0]}>
      {/* Main ring */}
      <mesh material={mats.steering}>
        <torusGeometry args={[SW_RADIUS, 0.016, 16, 40]} />
      </mesh>
      {/* Thick leather grip wrap */}
      <mesh material={mats.leather}>
        <torusGeometry args={[SW_RADIUS, 0.019, 8, 40]} />
      </mesh>
      {/* Hub center */}
      <mesh material={mats.darkTrim} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.018, 20]} />
      </mesh>
      {/* Chrome hub ring */}
      <mesh material={mats.chrome} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.045, 0.003, 8, 24]} />
      </mesh>
      {/* 3 spokes — top and two lower */}
      {/* Top spoke */}
      <mesh material={mats.steering} position={[0, SW_RADIUS * 0.5, 0]}>
        <boxGeometry args={[0.025, SW_RADIUS * 0.45, 0.014]} />
      </mesh>
      {/* Bottom-left spoke */}
      <mesh material={mats.steering} position={[-SW_RADIUS * 0.38, -SW_RADIUS * 0.28, 0]} rotation={[0, 0, -0.65]}>
        <boxGeometry args={[0.025, SW_RADIUS * 0.55, 0.014]} />
      </mesh>
      {/* Bottom-right spoke */}
      <mesh material={mats.steering} position={[SW_RADIUS * 0.38, -SW_RADIUS * 0.28, 0]} rotation={[0, 0, 0.65]}>
        <boxGeometry args={[0.025, SW_RADIUS * 0.55, 0.014]} />
      </mesh>
      {/* Steering column going into dash */}
      <mesh material={mats.darkTrim} position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.22, 12]} />
      </mesh>
    </group>
  );
}

function Dashboard() {
  return (
    <group>
      {/* Main dashboard body — wide, close, fills bottom of view */}
      <mesh position={[0, DASH_TOP_Y - DASH_THICK / 2, DASH_Z - DASH_DEPTH / 2]} material={mats.dash}>
        <boxGeometry args={[DASH_WIDTH, DASH_THICK, DASH_DEPTH]} />
      </mesh>

      {/* Dashboard top surface — soft padded lip */}
      <mesh position={[0, DASH_TOP_Y + 0.015, DASH_Z - DASH_DEPTH * 0.4]} material={mats.dashTop}>
        <boxGeometry args={[DASH_WIDTH - 0.05, 0.03, DASH_DEPTH * 0.65]} />
      </mesh>

      {/* Dashboard curve at windshield base */}
      <mesh position={[0, DASH_TOP_Y - 0.02, DASH_Z - DASH_DEPTH + 0.02]} material={mats.dash} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[DASH_WIDTH, 0.06, 0.12]} />
      </mesh>

      {/* Instrument cluster behind steering wheel — digital gauge panel */}
      <mesh position={[SW_X, DASH_TOP_Y + 0.08, DASH_Z - 0.06]} rotation={[-0.22, 0, 0]} material={mats.cluster}>
        <boxGeometry args={[0.30, 0.13, 0.015]} />
      </mesh>

      {/* Cluster visor/hood — blocks glare */}
      <mesh position={[SW_X, DASH_TOP_Y + 0.15, DASH_Z - 0.03]} rotation={[-0.55, 0, 0]} material={mats.darkTrim}>
        <boxGeometry args={[0.34, 0.04, 0.12]} />
      </mesh>

      {/* Infotainment screen (center-right) — this is the CarPlay screen */}
      <mesh position={[0.22, DASH_TOP_Y + 0.1, DASH_Z - 0.01]} rotation={[-0.18, 0, 0]} material={mats.screen}>
        <boxGeometry args={[0.28, 0.16, 0.012]} />
      </mesh>
      {/* Screen bezel */}
      <mesh position={[0.22, DASH_TOP_Y + 0.1, DASH_Z - 0.015]} rotation={[-0.18, 0, 0]} material={mats.darkTrim}>
        <boxGeometry args={[0.30, 0.18, 0.008]} />
      </mesh>

      {/* 3 air vents across dash */}
      {[-0.50, 0.0, 0.50].map((x, i) => (
        <group key={`vent-${i}`} position={[x, DASH_TOP_Y + 0.02, DASH_Z + 0.04]}>
          <mesh material={mats.vent}>
            <boxGeometry args={[0.14, 0.035, 0.03]} />
          </mesh>
          <mesh material={mats.chrome} position={[0, 0, 0.016]}>
            <boxGeometry args={[0.15, 0.04, 0.002]} />
          </mesh>
          {/* Vent slats */}
          {[-0.01, 0.005, 0.01].map((yOff, j) => (
            <mesh key={j} material={mats.darkTrim} position={[0, yOff, 0.005]}>
              <boxGeometry args={[0.12, 0.002, 0.025]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Hazard button */}
      <mesh position={[0.0, DASH_TOP_Y + 0.04, DASH_Z + 0.02]}>
        <cylinderGeometry args={[0.015, 0.015, 0.01, 12]} />
        <meshStandardMaterial color={0xcc2200} emissive={0xaa1100} emissiveIntensity={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

function CenterConsole() {
  return (
    <group>
      {/* Console body */}
      <mesh position={[0, DASH_TOP_Y - DASH_THICK - 0.08, 0.12]} material={mats.darkTrim}>
        <boxGeometry args={[0.26, 0.18, 0.5]} />
      </mesh>
      {/* Armrest pad */}
      <mesh position={[0, DASH_TOP_Y - DASH_THICK + 0.03, 0.2]} material={mats.leather}>
        <boxGeometry args={[0.22, 0.04, 0.25]} />
      </mesh>
      {/* Drive mode selector */}
      <mesh position={[0, DASH_TOP_Y - DASH_THICK + 0.06, 0.0]} material={mats.chrome}>
        <cylinderGeometry args={[0.018, 0.022, 0.05, 12]} />
      </mesh>
      {/* Cup holders */}
      {[-0.055, 0.055].map((x, i) => (
        <mesh key={`cup-${i}`} position={[x, DASH_TOP_Y - DASH_THICK + 0.02, 0.3]} material={mats.darkTrim}>
          <cylinderGeometry args={[0.038, 0.038, 0.035, 12]} />
        </mesh>
      ))}
    </group>
  );
}

function APillarsAndRoof() {
  return (
    <group>
      {/* Left A-pillar — angled from dash corner to roof */}
      <mesh
        material={mats.darkTrim}
        position={[-PILLAR_W, 0.08, -0.42]}
        rotation={[0.55, 0.12, 0.08]}
      >
        <boxGeometry args={[0.065, 0.045, 0.85]} />
      </mesh>
      {/* Right A-pillar */}
      <mesh
        material={mats.darkTrim}
        position={[PILLAR_W, 0.08, -0.42]}
        rotation={[0.55, -0.12, -0.08]}
      >
        <boxGeometry args={[0.065, 0.045, 0.85]} />
      </mesh>

      {/* Roof header — thin strip at very top of windshield */}
      <mesh position={[0, 0.48, -0.55]} material={mats.roof}>
        <boxGeometry args={[1.85, 0.035, 0.12]} />
      </mesh>

      {/* Roof panel behind driver */}
      <mesh position={[0, 0.5, 0.15]} material={mats.roof}>
        <boxGeometry args={[1.75, 0.025, 0.7]} />
      </mesh>

      {/* Rearview mirror */}
      <group position={[0, 0.38, -0.48]}>
        {/* Mount arm */}
        <mesh material={mats.darkTrim}>
          <boxGeometry args={[0.025, 0.1, 0.025]} />
        </mesh>
        {/* Mirror body */}
        <mesh position={[0, -0.06, -0.02]} rotation={[0.08, 0, 0]}>
          <boxGeometry args={[0.22, 0.055, 0.02]} />
          <meshStandardMaterial color={0x1a1a20} roughness={0.15} metalness={0.7} />
        </mesh>
      </group>

      {/* Windshield glass — nearly invisible, just slight tint */}
      <mesh position={[0, 0.12, -0.62]} rotation={[0.32, 0, 0]} material={mats.glass}>
        <planeGeometry args={[1.65, 0.82]} />
      </mesh>
    </group>
  );
}

function DoorPanels() {
  return (
    <group>
      {/* Left door — visible at edge of peripheral vision */}
      <group position={[-0.92, -0.18, -0.08]}>
        <mesh material={mats.doorPanel}>
          <boxGeometry args={[0.055, 0.6, 0.85]} />
        </mesh>
        {/* Armrest */}
        <mesh position={[0.03, 0.08, 0.0]} material={mats.leather}>
          <boxGeometry args={[0.07, 0.05, 0.28]} />
        </mesh>
        {/* Door handle */}
        <mesh position={[0.04, 0.15, 0.04]} material={mats.chrome}>
          <boxGeometry args={[0.015, 0.02, 0.09]} />
        </mesh>
        {/* Window switch panel */}
        <mesh position={[0.03, 0.1, -0.1]} material={mats.darkTrim}>
          <boxGeometry args={[0.04, 0.01, 0.12]} />
        </mesh>
      </group>

      {/* Right door */}
      <group position={[0.92, -0.18, -0.08]}>
        <mesh material={mats.doorPanel}>
          <boxGeometry args={[0.055, 0.6, 0.85]} />
        </mesh>
        <mesh position={[-0.03, 0.08, 0.0]} material={mats.leather}>
          <boxGeometry args={[0.07, 0.05, 0.28]} />
        </mesh>
        <mesh position={[-0.04, 0.15, 0.04]} material={mats.chrome}>
          <boxGeometry args={[0.015, 0.02, 0.09]} />
        </mesh>
      </group>
    </group>
  );
}

function FloorArea() {
  return (
    <group>
      {/* Floor mat */}
      <mesh position={[0, DASH_TOP_Y - DASH_THICK - 0.2, 0.0]} material={mats.floor}>
        <boxGeometry args={[1.7, 0.025, 1.1]} />
      </mesh>
      {/* Pedals */}
      <mesh position={[-0.12, DASH_TOP_Y - DASH_THICK - 0.1, DASH_Z + 0.1]} rotation={[0.3, 0, 0]} material={mats.chrome}>
        <boxGeometry args={[0.055, 0.07, 0.008]} />
      </mesh>
      <mesh position={[0.02, DASH_TOP_Y - DASH_THICK - 0.12, DASH_Z + 0.1]} rotation={[0.3, 0, 0]} material={mats.chrome}>
        <boxGeometry args={[0.055, 0.07, 0.008]} />
      </mesh>
    </group>
  );
}

function AmbientLighting() {
  return (
    <group>
      {/* Ambient accent strip — subtle red line along dash */}
      <mesh position={[0, DASH_TOP_Y - 0.01, DASH_Z + 0.06]} material={mats.redGlow}>
        <boxGeometry args={[1.3, 0.004, 0.004]} />
      </mesh>
      {/* Footwell light */}
      <pointLight position={[0, DASH_TOP_Y - DASH_THICK - 0.1, 0.0]} color={0x1a2a40} intensity={0.25} distance={0.8} />
      {/* Instrument cluster glow */}
      <pointLight position={[SW_X, DASH_TOP_Y + 0.06, DASH_Z - 0.03]} color={0x2244aa} intensity={0.12} distance={0.35} />
      {/* Screen glow */}
      <pointLight position={[0.22, DASH_TOP_Y + 0.1, DASH_Z]} color={0x1a3050} intensity={0.08} distance={0.25} />
    </group>
  );
}

export function PlayerCar() {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const eulerRef = useRef(new THREE.Euler());

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(camera.position);
      eulerRef.current.setFromQuaternion(camera.quaternion, "YXZ");
      groupRef.current.rotation.set(0, eulerRef.current.y, 0);
    }
  });

  return (
    <group ref={groupRef}>
      <Dashboard />
      <SteeringWheel />
      <CenterConsole />
      <APillarsAndRoof />
      <DoorPanels />
      <FloorArea />
      <AmbientLighting />
    </group>
  );
}
