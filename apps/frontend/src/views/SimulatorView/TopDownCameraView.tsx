import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { Color, Group, MathUtils, Mesh } from "three";
import { useSimulationStore, buildVehicleList } from "../../state/useSimulationStore";

const LANE_WIDTH_METERS = 3.6;
const STRIPE_COUNT = 48;
const STRIPE_SPACING_METERS = 8;
const DEFAULT_LANE_CENTERS = [-2 * LANE_WIDTH_METERS, -LANE_WIDTH_METERS, 0, LANE_WIDTH_METERS, 2 * LANE_WIDTH_METERS];

const TopDownRoad = () => {
  const storedLaneCenters = useSimulationStore((state) => state.laneCenters);
  const laneCenters = storedLaneCenters.length > 0 ? storedLaneCenters : DEFAULT_LANE_CENTERS;
  const laneCount = laneCenters.length;
  const laneDividers = useMemo(
    () => laneCenters.slice(0, -1).map((center, index) => (center + laneCenters[index + 1]) / 2),
    [laneCenters],
  );
  const baseColor = useMemo(() => new Color("#3b404d"), []);
  const shoulderColor = useMemo(() => new Color("#252932"), []);
  const groupRef = useRef<Group>(null);
  const stripeRefs = useRef<Mesh[][]>([]);
  const roadLength = STRIPE_COUNT * STRIPE_SPACING_METERS;
  const roadWidth = laneCount * LANE_WIDTH_METERS + 6;
  const halfRoadLength = roadLength / 2;

  useFrame(() => {
    const { player } = useSimulationStore.getState();
    const offsetZ = MathUtils.euclideanModulo(player.positionZ, STRIPE_SPACING_METERS);
    if (groupRef.current) {
      groupRef.current.position.set(-player.lateralOffset, 0, 0);
    }
    stripeRefs.current.forEach((laneStripes) => {
      laneStripes?.forEach((stripe, index) => {
        if (!stripe) return;
        const baseZ = -halfRoadLength + index * STRIPE_SPACING_METERS;
        let nextZ = baseZ + offsetZ;
        if (nextZ > halfRoadLength) {
          nextZ -= roadLength;
        }
        stripe.position.z = nextZ;
      });
    });
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[roadWidth + 8, roadLength]} />
        <meshStandardMaterial color={shoulderColor} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[roadWidth + 2, roadLength]} />
        <meshStandardMaterial color={baseColor} roughness={0.84} metalness={0.04} />
      </mesh>
      {laneCenters.map((center, index) => (
        <mesh key={`lane-shade-${center}`} rotation={[-Math.PI / 2, 0, 0]} position={[center, 0.025, 0]}>
          <planeGeometry args={[LANE_WIDTH_METERS, roadLength]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? "#404654" : "#343a47"}
            roughness={0.86}
            metalness={0.02}
          />
        </mesh>
      ))}
      {laneDividers.map((dividerX, dividerIdx) => (
        <group key={`lane-divider-${dividerIdx}`} position={[dividerX, 0.03, 0]}>
          {Array.from({ length: STRIPE_COUNT }).map((_, index) => (
            <mesh
              // eslint-disable-next-line react/no-array-index-key
              key={`dash-${dividerIdx}-${index}`}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, -index * STRIPE_SPACING_METERS]}
              ref={(instance) => {
                if (!stripeRefs.current[dividerIdx]) {
                  stripeRefs.current[dividerIdx] = [];
                }
                if (instance) {
                  stripeRefs.current[dividerIdx][index] = instance;
                }
              }}
            >
              <planeGeometry args={[0.24, STRIPE_SPACING_METERS * 0.5]} />
              <meshBasicMaterial color="#fafbff" />
            </mesh>
          ))}
        </group>
      ))}
      {[ -1, 1 ].map((side) => (
        <mesh key={`edge-${side}`} position={[side * (roadWidth / 2), 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.26, roadLength]} />
          <meshBasicMaterial color="#dde1ea" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[laneCenters[0] - LANE_WIDTH_METERS / 2 - 0.2, 0.036, 0]}>
        <planeGeometry args={[0.2, roadLength]} />
        <meshBasicMaterial color="#f4d35e" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[laneCenters[laneCount - 1] + LANE_WIDTH_METERS / 2 + 0.2, 0.036, 0]}>
        <planeGeometry args={[0.2, roadLength]} />
        <meshBasicMaterial color="#f4d35e" />
      </mesh>
    </group>
  );
};

const VehicleMarker = ({
  vehicleId,
  color,
  isPlayer,
}: {
  vehicleId: string;
  color: string;
  isPlayer?: boolean;
}) => {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const { npcVehicles, player } = useSimulationStore.getState();
    if (!meshRef.current) return;
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
    meshRef.current.position.set(relativeX, 0.3, relativeZ);
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1.4, 0.5, 3.4]} />
      <meshStandardMaterial color={color} emissive={isPlayer ? "#00bfff" : "#20222a"} />
    </mesh>
  );
};

const TopDownScene = () => {
  const player = useSimulationStore((state) => state.player);
  const npcVehicles = useSimulationStore((state) => state.npcVehicles);
  const laneCenters = useSimulationStore((state) => state.laneCenters);

  const vehicles = useMemo(
    () => buildVehicleList(player, npcVehicles, laneCenters).filter((vehicle) => vehicle.position),
    [player, npcVehicles, laneCenters],
  );

  return (
    <>
      <color attach="background" args={["#0d0f17"]} />
      <ambientLight intensity={0.74} color="#f1f6ff" />
      <hemisphereLight intensity={0.28} groundColor={new Color("#1b1e28")} color={new Color("#edf4ff")} />
      <directionalLight position={[6, 18, 8]} intensity={0.9} color="#f6f9ff" />
      <TopDownRoad />
      {vehicles.map((vehicle) => (
        <VehicleMarker
          key={vehicle.id}
          vehicleId={vehicle.id}
          color={vehicle.id === "player" ? "#00aaff" : "#f25f5c"}
          isPlayer={vehicle.id === "player"}
        />
      ))}
    </>
  );
};

export const TopDownCameraView = () => (
  <div className="canvas-container map-view">
    <Suspense fallback={<div className="canvas-fallback">Loading overview…</div>}>
      <Canvas
        orthographic
        camera={{ zoom: 12, position: [0, 80, 0] }}
        onCreated={({ camera }) => {
          camera.position.set(0, 80, 0.01);
          camera.up.set(0, 0, -1);
          camera.lookAt(0, 0, 0);
        }}
      >
        <TopDownScene />
      </Canvas>
    </Suspense>
  </div>
);
