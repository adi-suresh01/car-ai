import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { Color, Group, MathUtils, Mesh } from "three";
import { Sky } from "@react-three/drei";
import { useSimulationStore, buildVehicleList } from "../../state/useSimulationStore";
import type { VehicleState } from "../../models/simulation";
import AutopilotController from "../../components/AutopilotController";
import CarPlayDisplay from "../../components/CarPlayDisplay";

const LANE_WIDTH = 3.6;
const SEGMENT_LENGTH = 12;
const SEGMENT_COUNT = 32;

const RoadSurface = () => {
  const roadRef = useRef<Group>(null);
  const dashRefs = useRef<Mesh[][]>([]);
  const laneCenters = useSimulationStore((state) => state.laneCenters);
  const laneCount = laneCenters.length || 5;
  const laneDividers = useMemo(() => {
    if (laneCenters.length < 2) {
      return [-LANE_WIDTH, 0, LANE_WIDTH];
    }
    return laneCenters.slice(1).map((center, index) => (center + laneCenters[index]) / 2);
  }, [laneCenters]);

  useFrame(() => {
    const { player } = useSimulationStore.getState();
    const offset = MathUtils.euclideanModulo(player.positionZ, SEGMENT_LENGTH);

    if (roadRef.current) {
      roadRef.current.position.x = -player.lateralOffset;
    }

    dashRefs.current.forEach((laneStripes) => {
      laneStripes?.forEach((stripe, idx) => {
        if (!stripe) return;
        stripe.position.z = -idx * SEGMENT_LENGTH + offset;
      });
    });
  });

  const roadLength = SEGMENT_COUNT * SEGMENT_LENGTH;
  const roadWidth = laneCount * LANE_WIDTH + 6;

  return (
    <group ref={roadRef} position={[0, -0.025, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -roadLength * 0.5]}>
        <planeGeometry args={[roadWidth + 10, roadLength]} />
        <meshStandardMaterial color="#181b23" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -roadLength * 0.5]}>
        <planeGeometry args={[roadWidth, roadLength]} />
        <meshStandardMaterial color="#282c36" metalness={0.18} roughness={0.68} />
      </mesh>
      {laneDividers.map((x, dividerIdx) => (
        <group key={`lane-divider-${dividerIdx}`} position={[x, 0.02, 0]}>
          {Array.from({ length: SEGMENT_COUNT }).map((_, index) => (
            <mesh
              // eslint-disable-next-line react/no-array-index-key
              key={`dash-${dividerIdx}-${index}`}
              ref={(instance) => {
                if (!dashRefs.current[dividerIdx]) {
                  dashRefs.current[dividerIdx] = [];
                }
                if (instance) {
                  dashRefs.current[dividerIdx][index] = instance;
                }
              }}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, -index * SEGMENT_LENGTH]}
            >
              <planeGeometry args={[0.18, SEGMENT_LENGTH * 0.45]} />
              <meshBasicMaterial color="#f5f7fd" />
            </mesh>
          ))}
        </group>
      ))}
      {[ -1, 1 ].map((side) => (
        <mesh key={`edge-${side}`} position={[side * (roadWidth / 2), 0.02, -roadLength * 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.22, roadLength]} />
          <meshBasicMaterial color="#d8dae0" />
        </mesh>
      ))}
    </group>
  );
};

const GuardRails = () => {
  const railsRef = useRef<Group>(null);
  const laneCenters = useSimulationStore((state) => state.laneCenters);
  const laneCount = laneCenters.length || 5;
  const roadWidth = laneCount * LANE_WIDTH + 6;

  useFrame(() => {
    const { player } = useSimulationStore.getState();
    if (railsRef.current) {
      const offset = MathUtils.euclideanModulo(player.positionZ, SEGMENT_LENGTH * 2);
      railsRef.current.position.set(-player.lateralOffset, 0.25, offset);
    }
  });

  return (
    <group ref={railsRef}>
      {[ -1, 1 ].map((side) => (
        <mesh key={`rail-${side}`} position={[side * (roadWidth / 2 + 1.8), 0, -SEGMENT_COUNT * SEGMENT_LENGTH * 0.5]}>
          <boxGeometry args={[0.28, 0.75, SEGMENT_COUNT * SEGMENT_LENGTH]} />
          <meshStandardMaterial color="#828a9d" metalness={0.45} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
};

const PalmRow = ({ side }: { side: -1 | 1 }) => {
  const laneCenters = useSimulationStore((state) => state.laneCenters);
  const laneCount = laneCenters.length || 5;
  const offsetX = side * (laneCount * LANE_WIDTH / 2 + 6);
  const palmRefs = useRef<Group[]>([]);

  useFrame(() => {
    const { player } = useSimulationStore.getState();
    const loopLength = SEGMENT_COUNT * SEGMENT_LENGTH;
    const offset = MathUtils.euclideanModulo(player.positionZ * 0.6, loopLength);
    palmRefs.current.forEach((palm, idx) => {
      if (!palm) return;
      palm.position.z = -idx * (SEGMENT_LENGTH * 1.6) + offset;
    });
  });

  return (
    <group position={[offsetX, 0, 0]}>
      {Array.from({ length: 16 }).map((_, index) => (
        <group
          // eslint-disable-next-line react/no-array-index-key
          key={`palm-${side}-${index}`}
          ref={(instance) => {
            palmRefs.current[index] = instance ?? palmRefs.current[index];
          }}
          position={[0, 0, -index * (SEGMENT_LENGTH * 1.6)]}
        >
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.25, 0.32, 3.2, 6]} />
            <meshStandardMaterial color="#4a392a" />
          </mesh>
          <mesh position={[0, 3, 0]}>
            <coneGeometry args={[1.6, 2.2, 10]} />
            <meshStandardMaterial color="#2a3f31" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const ExteriorScene = () => (
  <>
    <color attach="background" args={["#0c101a"]} />
    <fog attach="fog" args={["#101624", 55, 320]} />
    <hemisphereLight intensity={0.65} groundColor={new Color("#080a12")} color={new Color("#dbe6ff")} />
    <directionalLight position={[10, 18, 8]} intensity={1.1} color="#e8edff" />
    <Sky
      distance={450000}
      sunPosition={[0.1, 0.7, -0.35]}
      inclination={0.48}
      azimuth={0.42}
      mieCoefficient={0.004}
      mieDirectionalG={0.84}
      rayleigh={2.8}
      turbidity={1.8}
    />
    <DistantBackdrop />
    <RoadSurface />
    <GuardRails />
    <PalmRow side={-1} />
    <PalmRow side={1} />
  </>
);

const VEHICLE_COLOR_MAP: Record<string, string> = {
  sedan: "#f26d5b",
  suv: "#f7b32b",
  truck: "#639fab",
  motorcycle: "#9b5de5",
};

const TrafficVehicle = ({ vehicleId, type }: { vehicleId: string; type?: string }) => {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    const { npcVehicles, player } = useSimulationStore.getState();
    if (!groupRef.current) return;
    const vehicle = npcVehicles.find((candidate) => candidate.id === vehicleId);
    if (!vehicle || !vehicle.position) return;
    const vehicleWorldX = vehicle.position[0] ?? 0;
    const vehicleWorldZ = vehicle.position[2] ?? 0;
    const playerWorldX = Number.isFinite(player.lateralOffset)
      ? player.lateralOffset
      : player.laneCenter;
    const relativeX = vehicleWorldX - playerWorldX;
    const relativeZ = -(vehicleWorldZ - player.positionZ);
    if (!Number.isFinite(relativeX) || !Number.isFinite(relativeZ)) return;
    groupRef.current.position.set(relativeX, 0.1, relativeZ);
  });

  const color = type ? VEHICLE_COLOR_MAP[type] ?? VEHICLE_COLOR_MAP.sedan : VEHICLE_COLOR_MAP.sedan;

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.6, 0.9, 3.8]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[1.9, 0.22, 4.4]} />
        <meshStandardMaterial color="#1a1d24" />
      </mesh>
    </group>
  );
};

const TrafficVehicles = ({ vehicles }: { vehicles: VehicleState[] }) => (
  <group>
    {vehicles.map((vehicle) => (
      <TrafficVehicle key={vehicle.id} vehicleId={vehicle.id} type={vehicle.type} />
    ))}
  </group>
);

const DistantBackdrop = () => (
  <group position={[0, -1.2, -160]}>
    {[...Array(8)].map((_, index) => (
      <mesh key={`ridge-${index}`} position={[index * 35 - 120, 0, -index * 35]}>
        <coneGeometry args={[26, 18, 6, 1]} />
        <meshStandardMaterial color={index % 2 === 0 ? "#3d465d" : "#4a5268"} flatShading />
      </mesh>
    ))}
  </group>
);

const DriverCameraRig = () => {
  const { camera } = useThree();
  const rollRef = useRef(0);

  useFrame(() => {
    const { player } = useSimulationStore.getState();
    const targetRoll = MathUtils.degToRad(player.steerAngleDeg) * 0.05;
    rollRef.current = MathUtils.lerp(rollRef.current, targetRoll, 0.08);
    camera.position.set(-0.36, 0.96, 1.9);
    camera.lookAt(-0.36, 0.24, -10);
    camera.rotation.z = rollRef.current;
  });

  return null;
};

const DriverInteriorOverlay = () => {
  const player = useSimulationStore((state) => state.player);
  const control = useSimulationStore((state) => state.controlInput);
  const steerAngle = player.steerAngleDeg;

  return (
    <div className="driver-interior-overlay">
      <div className="interior-roof" />
      <div className="interior-pillar interior-pillar-left" />
      <div className="interior-pillar interior-pillar-right" />
      <div className="interior-window-tint" />
      <div className="interior-door" />
      <div className="interior-side-mirror" />
      <div className="interior-mirror" />

      <div className="interior-dashboard" />
      <div className="interior-console" />
      <div className="interior-lower-shell" />

      <div className="interior-cluster">
        <div className="cluster-backplate" />
        <div className="cluster-gauge">
          <span className="cluster-speed">{Math.round(player.speedMph).toString().padStart(2, "0")}</span>
          <span className="cluster-speed-unit">MPH</span>
        </div>
        <div className="cluster-meta">
          <span>Gear D{player.gear}</span>
          <span>Lane {player.laneIndex + 1}</span>
          <span>Steer {player.steerAngleDeg.toFixed(0)}°</span>
        </div>
      </div>

      <div className="interior-carplay">
        <header>
          <span>CarPlay</span>
          <strong>Highway 101 South</strong>
        </header>
        <div className="carplay-nav">Stay on US-101 S for 14 mi</div>
        <div className="carplay-eta">ETA 18:24</div>
        <div className="carplay-controls">
          <label>
            Throttle
            <span>
              <i style={{ width: `${Math.round(control.throttle * 100)}%` }} />
            </span>
          </label>
          <label>
            Brake
            <span>
              <i style={{ width: `${Math.round(control.brake * 100)}%` }} />
            </span>
          </label>
        </div>
      </div>

      <div className="interior-wheel-wrapper">
        <div className="interior-wheel" style={{ transform: `translate(-50%, -50%) rotate(${ -steerAngle }deg)` }}>
          <span className="wheel-ring" />
          <span className="wheel-hub" />
          <span className="wheel-spoke wheel-spoke-vertical" />
          <span className="wheel-spoke wheel-spoke-left" />
          <span className="wheel-spoke wheel-spoke-right" />
          <span className="wheel-cutout" />
        </div>
      </div>
    </div>
  );
};

export const DriverCameraView = () => (
  <div className="canvas-container driver-view">
    <AutopilotController enabled />
    <Suspense fallback={<div className="canvas-fallback">Loading cockpit…</div>}>
      <Canvas camera={{ position: [-0.36, 0.96, 1.9], fov: 64, near: 0.01 }}>
        <ExteriorScene />
        <TrafficVehiclesBridge />
        <DriverCameraRig />
      </Canvas>
    </Suspense>
    <DriverInteriorOverlay />
    <CarPlayDisplay />
  </div>
);

const TrafficVehiclesBridge = () => {
  const player = useSimulationStore((state) => state.player);
  const npcVehicles = useSimulationStore((state) => state.npcVehicles);
  const laneCenters = useSimulationStore((state) => state.laneCenters);

  const vehicles = useMemo(
    () =>
      buildVehicleList(player, npcVehicles, laneCenters).filter(
        (vehicle) => vehicle.id !== "player" && vehicle.position,
      ),
    [player, npcVehicles, laneCenters],
  );

  return <TrafficVehicles vehicles={vehicles} />;
};
