import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

// ── Positioning constants (camera-relative, camera = driver's eyes at origin) ──

const DASH_TOP_Y = -0.37;
const DASH_Z_FRONT = -0.75;
const DASH_Z_BACK = -0.30;
const DASH_WIDTH = 2.0;

const SW_X = -0.28;
const SW_Y = -0.34;
const SW_Z = -0.36;
const SW_RADIUS = 0.19;
const SW_TILT = -0.40;

const PILLAR_X = 0.88;

const CLUSTER_W = 0.28;
const CLUSTER_H = 0.14;
const CLUSTER_CANVAS_W = 512;
const CLUSTER_CANVAS_H = 256;

// ── Materials ──

const mats = {
  dash: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0.05 }),
  dashTop: new THREE.MeshStandardMaterial({ color: 0x222220, roughness: 0.85, metalness: 0.03 }),
  darkTrim: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.02 }),
  steering: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55, metalness: 0.1 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.75, metalness: 0.02 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.96, metalness: 0.0 }),
  doorPanel: new THREE.MeshStandardMaterial({ color: 0x151514, roughness: 0.88, metalness: 0.03 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xccbb99,
    transparent: true,
    opacity: 0.04,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  mirror: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.05, metalness: 0.95 }),
};

// ── Dashboard geometry (smooth curved profile via ExtrudeGeometry) ──

function createDashboardGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const hw = DASH_WIDTH / 2;

  shape.moveTo(-hw, 0);

  shape.bezierCurveTo(-hw, 0, -hw + 0.15, 0.12, -hw + 0.4, 0.13);
  shape.bezierCurveTo(-0.3, 0.16, 0.3, 0.16, hw - 0.4, 0.13);
  shape.bezierCurveTo(hw - 0.15, 0.12, hw, 0, hw, 0);

  shape.lineTo(hw, -0.18);

  shape.bezierCurveTo(hw, -0.22, hw - 0.1, -0.24, hw - 0.3, -0.24);
  shape.lineTo(-hw + 0.3, -0.24);
  shape.bezierCurveTo(-hw + 0.1, -0.24, -hw, -0.22, -hw, -0.18);

  shape.closePath();

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: Math.abs(DASH_Z_FRONT - DASH_Z_BACK),
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 4,
    curveSegments: 24,
  };

  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

function Dashboard() {
  const dashGeo = useMemo(() => createDashboardGeometry(), []);

  return (
    <group>
      <mesh
        geometry={dashGeo}
        material={mats.dash}
        position={[0, DASH_TOP_Y - 0.13, DASH_Z_BACK]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <mesh
        material={mats.dashTop}
        position={[0, DASH_TOP_Y + 0.02, (DASH_Z_FRONT + DASH_Z_BACK) / 2]}
      >
        <boxGeometry args={[DASH_WIDTH - 0.1, 0.018, Math.abs(DASH_Z_FRONT - DASH_Z_BACK) * 0.5]} />
      </mesh>
    </group>
  );
}

// ── Instrument cluster (CanvasTexture with live gauges) ──

function InstrumentCluster() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CLUSTER_CANVAS_W;
    canvas.height = CLUSTER_CANVAS_H;
    canvasRef.current = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textureRef.current = texture;

    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshStandardMaterial).map = texture;
      (meshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }

    return () => {
      texture.dispose();
    };
  }, []);

  useFrame(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = useSimulationStore.getState();
    const speedMph = state.player.speedMph;
    const speedKph = speedMph * 1.60934;
    const gear = state.player.gear;

    const w = CLUSTER_CANVAS_W;
    const h = CLUSTER_CANVAS_H;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // ── Speed (left side) ──
    ctx.fillStyle = "#e8e8e8";
    ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.round(speedKph).toString(), 100, 100);

    ctx.fillStyle = "#888888";
    ctx.font = "16px sans-serif";
    ctx.fillText("KPH", 100, 150);

    // ── Tachometer arc (center) ──
    const cx = w / 2;
    const cy = 105;
    const arcR = 65;
    const arcStart = Math.PI * 0.75;
    const arcEnd = Math.PI * 0.25;
    const arcTotal = Math.PI * 1.5;

    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, arcStart, Math.PI * 2 + arcEnd, false);
    ctx.stroke();

    const rpmFraction = Math.min(1, (speedKph / 220));
    const needleAngle = arcStart + arcTotal * rpmFraction;

    ctx.strokeStyle = "#ff4422";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, arcStart, needleAngle, false);
    ctx.stroke();

    const needleLen = arcR - 8;
    const nx = cx + Math.cos(needleAngle) * needleLen;
    const ny = cy + Math.sin(needleAngle) * needleLen;

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();

    // ── Gear indicator (inside tach) ──
    ctx.fillStyle = "#cccccc";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`D${gear}`, cx, cy + 38);

    // ── Odometer (center bottom) ──
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "22px monospace";
    ctx.textAlign = "center";
    const odo = "00000";
    ctx.fillText(odo, cx, 195);

    ctx.fillStyle = "#666666";
    ctx.font = "12px sans-serif";
    ctx.fillText("KM", cx, 215);

    // ── Clock (below odometer) ──
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    ctx.fillStyle = "#999999";
    ctx.font = "18px monospace";
    ctx.fillText(`${hours}:${minutes}`, cx, 240);

    // ── Drive mode (right side) ──
    ctx.fillStyle = "#77aa77";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AWD", w - 100, 100);

    ctx.fillStyle = "#555555";
    ctx.font = "14px sans-serif";
    ctx.fillText("DRIVE MODE", w - 100, 130);

    // ── Thin accent lines ──
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 30);
    ctx.lineTo(w - 20, 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, h - 20);
    ctx.lineTo(w - 20, h - 20);
    ctx.stroke();

    texture.needsUpdate = true;
  });

  const clusterMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.05,
        emissive: 0x222222,
        emissiveIntensity: 0.3,
      }),
    []
  );

  return (
    <group position={[SW_X, DASH_TOP_Y + 0.1, DASH_Z_BACK - 0.12]} rotation={[-0.2, 0, 0]}>
      <mesh ref={meshRef} material={clusterMat}>
        <planeGeometry args={[CLUSTER_W, CLUSTER_H]} />
      </mesh>
      <mesh material={mats.darkTrim} position={[0, 0.08, -0.005]}>
        <boxGeometry args={[CLUSTER_W + 0.04, 0.035, 0.025]} />
      </mesh>
    </group>
  );
}

// ── Steering wheel ──

function SteeringWheel() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const steerDeg = useSimulationStore.getState().player.steerAngleDeg;
    groupRef.current.rotation.z = -(steerDeg / PHYSICS.MAX_STEER_DEG) * Math.PI * 0.75;
  });

  return (
    <group position={[SW_X, SW_Y, SW_Z]} rotation={[SW_TILT, 0, 0]} ref={groupRef}>
      <mesh material={mats.steering}>
        <torusGeometry args={[SW_RADIUS, 0.017, 20, 48]} />
      </mesh>
      <mesh material={mats.leather}>
        <torusGeometry args={[SW_RADIUS, 0.021, 10, 48]} />
      </mesh>

      <mesh material={mats.darkTrim} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.015, 24]} />
      </mesh>

      {/* Top spoke */}
      <mesh material={mats.steering} position={[0, SW_RADIUS * 0.48, 0]}>
        <boxGeometry args={[0.028, SW_RADIUS * 0.5, 0.012]} />
      </mesh>
      {/* Bottom-left spoke */}
      <mesh
        material={mats.steering}
        position={[-SW_RADIUS * 0.4, -SW_RADIUS * 0.26, 0]}
        rotation={[0, 0, -0.7]}
      >
        <boxGeometry args={[0.028, SW_RADIUS * 0.58, 0.012]} />
      </mesh>
      {/* Bottom-right spoke */}
      <mesh
        material={mats.steering}
        position={[SW_RADIUS * 0.4, -SW_RADIUS * 0.26, 0]}
        rotation={[0, 0, 0.7]}
      >
        <boxGeometry args={[0.028, SW_RADIUS * 0.58, 0.012]} />
      </mesh>

      <mesh material={mats.darkTrim} position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.032, 0.26, 12]} />
      </mesh>
    </group>
  );
}

// ── A-pillars (trapezoidal cross-section, ExtrudeGeometry) ──

function createPillarGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.04, -0.025);
  shape.lineTo(0.04, -0.015);
  shape.lineTo(0.035, 0.015);
  shape.lineTo(-0.035, 0.025);
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.92,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
    curveSegments: 8,
  });
}

function APillarsAndRoof() {
  const pillarGeo = useMemo(() => createPillarGeometry(), []);

  const leftPillarPos: [number, number, number] = [-PILLAR_X, DASH_TOP_Y + 0.15, -0.72];
  const rightPillarPos: [number, number, number] = [PILLAR_X, DASH_TOP_Y + 0.15, -0.72];

  return (
    <group>
      {/* Left A-pillar */}
      <mesh
        geometry={pillarGeo}
        material={mats.darkTrim}
        position={leftPillarPos}
        rotation={[-0.55, 0.1, 0.06]}
      />
      {/* Right A-pillar */}
      <mesh
        geometry={pillarGeo}
        material={mats.darkTrim}
        position={rightPillarPos}
        rotation={[-0.55, -0.1, -0.06]}
      />

      {/* Roof header strip */}
      <mesh position={[0, 0.48, -0.58]} material={mats.roof}>
        <boxGeometry args={[1.9, 0.04, 0.1]} />
      </mesh>

      {/* Roof panel behind driver */}
      <mesh position={[0, 0.5, 0.1]} material={mats.roof}>
        <boxGeometry args={[1.8, 0.025, 0.75]} />
      </mesh>

      {/* Rearview mirror */}
      <group position={[0, 0.40, -0.52]}>
        <mesh material={mats.darkTrim}>
          <boxGeometry args={[0.02, 0.1, 0.02]} />
        </mesh>
        <mesh position={[0, -0.07, -0.015]} rotation={[0.1, 0, 0]}>
          <boxGeometry args={[0.24, 0.06, 0.018]} />
          <meshStandardMaterial color={0x1a1a1a} roughness={0.3} metalness={0.5} />
        </mesh>
        <mesh position={[0, -0.07, -0.026]} rotation={[0.1, 0, 0]} material={mats.mirror}>
          <planeGeometry args={[0.22, 0.05]} />
        </mesh>
      </group>

      {/* Windshield glass */}
      <mesh position={[0, 0.1, -0.65]} rotation={[0.3, 0, 0]} material={mats.glass}>
        <planeGeometry args={[1.7, 0.88]} />
      </mesh>
    </group>
  );
}

// ── Door panels ──

function DoorPanels() {
  const doorShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.3);
    shape.bezierCurveTo(0, -0.3, 0, 0.2, 0, 0.25);
    shape.lineTo(0.04, 0.25);
    shape.lineTo(0.04, -0.3);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.9,
      bevelEnabled: false,
      curveSegments: 12,
    });
  }, []);

  return (
    <group>
      {/* Left door */}
      <group position={[-0.94, -0.12, -0.4]}>
        <mesh geometry={doorShape} material={mats.doorPanel} />
        <mesh position={[0.025, 0.05, 0.35]} material={mats.leather}>
          <boxGeometry args={[0.06, 0.045, 0.26]} />
        </mesh>
      </group>

      {/* Right door */}
      <group position={[0.90, -0.12, -0.4]}>
        <mesh geometry={doorShape} material={mats.doorPanel} rotation={[0, Math.PI, 0]} />
        <mesh position={[-0.025, 0.05, 0.35]} material={mats.leather}>
          <boxGeometry args={[0.06, 0.045, 0.26]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Main export ──

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
      <InstrumentCluster />
      <SteeringWheel />
      <APillarsAndRoof />
      <DoorPanels />
    </group>
  );
}
