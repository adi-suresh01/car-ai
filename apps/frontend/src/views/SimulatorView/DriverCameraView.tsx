import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Suspense, useMemo, useRef, useEffect } from "react";
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  Group,
  MathUtils,
  Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader";
import { useSimulationStore, buildVehicleList } from "../../state/useSimulationStore";
import type { VehicleState } from "../../models/simulation";
import AutopilotController from "../../components/AutopilotController";
import CarPlayDisplay from "../../components/CarPlayDisplay";
import DashboardConsole from "../../components/DashboardConsole";

const LANE_WIDTH = 3.6;
const SEGMENT_LENGTH = 12;
const SEGMENT_COUNT = 32;

const createAsphaltTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return undefined;
  }
  ctx.fillStyle = "#2b2f3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 2200; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const shade = Math.floor(26 + Math.random() * 38);
    ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 6})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.fillRect(x, y, 3, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 10);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

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
  const asphaltTexture = useMemo(() => createAsphaltTexture(), []);

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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -roadLength * 0.5]} receiveShadow>
        <planeGeometry args={[roadWidth + 14, roadLength]} />
        <meshStandardMaterial color="#12151e" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -roadLength * 0.5]} receiveShadow>
        <planeGeometry args={[roadWidth, roadLength]} />
        <meshStandardMaterial
          color="#2a2f3b"
          metalness={0.22}
          roughness={0.82}
          map={asphaltTexture ?? null}
        />
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
              receiveShadow
            >
              <planeGeometry args={[0.22, SEGMENT_LENGTH * 0.5]} />
              <meshStandardMaterial color="#f7f9ff" emissive="#dfe7ff" emissiveIntensity={0.2} />
            </mesh>
          ))}
        </group>
      ))}
      {[ -1, 1 ].map((side) => (
        <mesh
          key={`edge-${side}`}
          position={[side * (roadWidth / 2), 0.02, -roadLength * 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.26, roadLength]} />
          <meshStandardMaterial color="#d7dbe4" />
        </mesh>
      ))}
      {[ -1, 1 ].map((side) => (
        <mesh
          key={`rumble-${side}`}
          position={[side * (roadWidth / 2 + 0.4), 0.016, -roadLength * 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.4, roadLength]} />
          <meshStandardMaterial color="#c9b778" roughness={0.7} />
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
        <mesh
          key={`rail-${side}`}
          position={[side * (roadWidth / 2 + 1.8), 0, -SEGMENT_COUNT * SEGMENT_LENGTH * 0.5]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[0.3, 0.8, SEGMENT_COUNT * SEGMENT_LENGTH]} />
          <meshStandardMaterial color="#9098aa" metalness={0.5} roughness={0.25} />
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
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.34, 3.4, 6]} />
            <meshStandardMaterial color="#4a392a" />
          </mesh>
          <mesh position={[0, 3.1, 0]} castShadow>
            <coneGeometry args={[1.7, 2.4, 10]} />
            <meshStandardMaterial color="#2a3f31" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const CockpitShell = () => (
  <group position={[0, 0, 1.4]}>
    <mesh rotation={[MathUtils.degToRad(-22), 0, 0]} position={[0, 0.08, -0.2]} receiveShadow>
      <boxGeometry args={[3.4, 0.4, 2.6]} />
      <meshStandardMaterial color="#10131a" roughness={0.7} metalness={0.1} />
    </mesh>
    <mesh rotation={[MathUtils.degToRad(-12), 0, 0]} position={[0, -0.04, 0.25]} receiveShadow>
      <boxGeometry args={[3.8, 0.35, 2.4]} />
      <meshStandardMaterial color="#0d1016" roughness={0.9} />
    </mesh>
  </group>
);

const CockpitFrame = () => (
  <group position={[0, 0.3, 1.2]}>
    <mesh position={[-1.4, 0.6, -0.6]} rotation={[0, 0.18, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.18, 1.6, 2.2]} />
      <meshStandardMaterial color="#12151c" roughness={0.6} />
    </mesh>
    <mesh position={[1.4, 0.6, -0.6]} rotation={[0, -0.18, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.18, 1.6, 2.2]} />
      <meshStandardMaterial color="#12151c" roughness={0.6} />
    </mesh>
    <mesh position={[0, 1.2, -0.5]} rotation={[MathUtils.degToRad(-14), 0, 0]}>
      <planeGeometry args={[3.2, 1.5]} />
      <meshPhysicalMaterial
        transparent
        opacity={0.16}
        roughness={0.05}
        metalness={0}
        color="#a7b7d6"
        transmission={0.7}
        thickness={0.4}
      />
    </mesh>
    <mesh position={[0, -0.15, 0.2]} rotation={[MathUtils.degToRad(-8), 0, 0]} receiveShadow>
      <boxGeometry args={[1.4, 0.28, 1.1]} />
      <meshStandardMaterial color="#1b2130" roughness={0.65} metalness={0.05} />
    </mesh>
    <mesh position={[0, 0.06, -0.1]} receiveShadow>
      <boxGeometry args={[2.1, 0.12, 0.25]} />
      <meshStandardMaterial color="#0e121a" roughness={0.4} metalness={0.2} />
    </mesh>
    <mesh position={[-0.7, 0.05, 0.8]} rotation={[0, 0.1, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.65, 0.9, 1]} />
      <meshStandardMaterial color="#0f131a" roughness={0.7} />
    </mesh>
    <mesh position={[0.7, 0.05, 0.8]} rotation={[0, -0.1, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.65, 0.9, 1]} />
      <meshStandardMaterial color="#0f131a" roughness={0.7} />
    </mesh>
    <mesh position={[0, 0.45, -0.75]} rotation={[MathUtils.degToRad(-6), 0, 0]} castShadow>
      <boxGeometry args={[0.9, 0.3, 0.22]} />
      <meshStandardMaterial color="#101622" emissive="#4aa3ff" emissiveIntensity={0.35} />
    </mesh>
  </group>
);

const ExteriorScene = () => (
  <>
    <color attach="background" args={["#0b111c"]} />
    <fog attach="fog" args={["#0f1525", 60, 340]} />
    <hemisphereLight intensity={0.55} groundColor={new Color("#080a12")} color={new Color("#dbe6ff")} />
    <directionalLight
      position={[12, 18, 8]}
      intensity={1.2}
      color="#f2f6ff"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-far={60}
      shadow-camera-left={-18}
      shadow-camera-right={18}
      shadow-camera-top={18}
      shadow-camera-bottom={-18}
    />
    <directionalLight position={[-8, 6, 4]} intensity={0.35} color="#9fb6ff" />
    <Sky
      distance={450000}
      sunPosition={[0.08, 0.78, -0.35]}
      inclination={0.48}
      azimuth={0.42}
      mieCoefficient={0.004}
      mieDirectionalG={0.84}
      rayleigh={2.4}
      turbidity={1.9}
    />
    <DistantBackdrop />
    <RoadSurface />
    <GuardRails />
    <PalmRow side={-1} />
    <PalmRow side={1} />
    <CockpitShell />
    <CockpitFrame />
  </>
);

const VEHICLE_COLOR_MAP: Record<string, string> = {
  sedan: "#f26d5b",
  suv: "#f7b32b",
  truck: "#639fab",
  motorcycle: "#9b5de5",
};

const VEHICLE_DIMENSIONS: Record<string, { width: number; height: number; length: number; cabin: number }> = {
  sedan: { width: 1.85, height: 0.85, length: 4.4, cabin: 0.45 },
  suv: { width: 2.0, height: 1.1, length: 4.8, cabin: 0.6 },
  truck: { width: 2.2, height: 1.2, length: 5.4, cabin: 0.65 },
  motorcycle: { width: 0.7, height: 0.8, length: 2.2, cabin: 0.2 },
};

const VehicleMesh = ({ color, type }: { color: string; type: string }) => {
  const spec = VEHICLE_DIMENSIONS[type] ?? VEHICLE_DIMENSIONS.sedan;
  const wheelRadius = type === "motorcycle" ? 0.32 : 0.38;
  const wheelWidth = type === "motorcycle" ? 0.18 : 0.22;
  const wheelOffsetX = spec.width * 0.46;
  const wheelOffsetZ = spec.length * 0.36;
  const cabinHeight = spec.cabin;

  const wheelPositions = [
    [wheelOffsetX, wheelRadius, wheelOffsetZ],
    [-wheelOffsetX, wheelRadius, wheelOffsetZ],
    [wheelOffsetX, wheelRadius, -wheelOffsetZ],
    [-wheelOffsetX, wheelRadius, -wheelOffsetZ],
  ];

  return (
    <group>
      <mesh position={[0, spec.height * 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[spec.width, spec.height, spec.length]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.35} />
      </mesh>
      <mesh position={[0, spec.height * 0.5 + cabinHeight * 0.5, -spec.length * 0.08]} castShadow>
        <boxGeometry args={[spec.width * 0.65, cabinHeight, spec.length * 0.5]} />
        <meshStandardMaterial color="#b7c6de" metalness={0.05} roughness={0.1} transparent opacity={0.75} />
      </mesh>
      <mesh position={[0, spec.height * 0.3, spec.length * 0.46]} castShadow>
        <boxGeometry args={[spec.width * 0.7, spec.height * 0.2, spec.length * 0.08]} />
        <meshStandardMaterial color="#f7f2d4" emissive="#f7f2d4" emissiveIntensity={0.9} />
      </mesh>
      {wheelPositions.map((position, index) => (
        <mesh
          // eslint-disable-next-line react/no-array-index-key
          key={`wheel-${index}`}
          position={position as [number, number, number]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 18]} />
          <meshStandardMaterial color="#101217" roughness={0.8} />
        </mesh>
      ))}
      {type !== "motorcycle" ? (
        <mesh position={[0, spec.height * 0.15, -spec.length * 0.48]}>
          <boxGeometry args={[spec.width * 0.7, spec.height * 0.18, spec.length * 0.06]} />
          <meshStandardMaterial color="#7a0b14" emissive="#7a0b14" emissiveIntensity={0.6} />
        </mesh>
      ) : null}
    </group>
  );
};

const TrafficVehicle = ({ vehicleId, type }: { vehicleId: string; type?: string }) => {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    const { npcVehicleMap, player } = useSimulationStore.getState();
    if (!groupRef.current) return;
    const vehicle = npcVehicleMap[vehicleId];
    if (!vehicle || !vehicle.position) return;
    const vehicleWorldX = vehicle.position[0] ?? 0;
    const vehicleWorldZ = vehicle.position[2] ?? 0;
    const playerWorldX = Number.isFinite(player.lateralOffset) ? player.lateralOffset : player.laneCenter;
    const relativeX = vehicleWorldX - playerWorldX;
    const relativeZ = -(vehicleWorldZ - player.positionZ);
    if (!Number.isFinite(relativeX) || !Number.isFinite(relativeZ)) return;
    groupRef.current.position.set(relativeX, 0.1, relativeZ);
  });

  const color = type ? VEHICLE_COLOR_MAP[type] ?? VEHICLE_COLOR_MAP.sedan : VEHICLE_COLOR_MAP.sedan;
  const resolvedType = type ?? "sedan";

  return (
    <group ref={groupRef}>
      <VehicleMesh color={color} type={resolvedType} />
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
      <mesh key={`ridge-${index}`} position={[index * 35 - 120, 0, -index * 35]} receiveShadow>
        <coneGeometry args={[26, 18, 6, 1]} />
        <meshStandardMaterial color={index % 2 === 0 ? "#3d465d" : "#4a5268"} flatShading />
      </mesh>
    ))}
  </group>
);

const DriverCameraRig = () => {
  const { camera } = useThree();
  const rollRef = useRef(0);
  const lookRef = useRef({ x: -0.36, y: 0.24, z: -10 });

  useFrame((state) => {
    const { player } = useSimulationStore.getState();
    const speedFactor = MathUtils.clamp(player.speedMph / 90, 0, 1);
    const targetRoll = MathUtils.degToRad(player.steerAngleDeg) * 0.08;
    rollRef.current = MathUtils.lerp(rollRef.current, targetRoll, 0.06);

    const sway = Math.sin(state.clock.elapsedTime * 0.8) * 0.02 * speedFactor;
    const bob = Math.sin(state.clock.elapsedTime * 2.1) * 0.015 * speedFactor;
    camera.position.set(-0.36 + sway, 0.98 + bob, 1.9);

    const targetFov = 60 + speedFactor * 6;
    camera.fov = MathUtils.lerp(camera.fov, targetFov, 0.08);
    camera.updateProjectionMatrix();

    lookRef.current.x = MathUtils.lerp(lookRef.current.x, -0.36, 0.06);
    lookRef.current.y = MathUtils.lerp(lookRef.current.y, 0.24, 0.06);
    lookRef.current.z = MathUtils.lerp(lookRef.current.z, -10, 0.06);
    camera.lookAt(lookRef.current.x, lookRef.current.y, lookRef.current.z);
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
        <div className="interior-wheel" style={{ transform: `translate(-50%, -50%) rotate(${-steerAngle}deg)` }}>
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

const PostProcessing = () => {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomRef = useRef<UnrealBloomPass | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));

    const bloom = new UnrealBloomPass(new Vector2(size.width, size.height), 0.35, 0.8, 0.18);
    composer.addPass(bloom);

    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.92;
    vignette.uniforms.darkness.value = 1.15;
    composer.addPass(vignette);

    composerRef.current = composer;
    bloomRef.current = bloom;

    return () => {
      composer.dispose();
      composerRef.current = null;
      bloomRef.current = null;
    };
  }, [gl, scene, camera, size.width, size.height]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
    bloomRef.current?.setSize(size.width, size.height);
  }, [size]);

  useFrame(() => {
    composerRef.current?.render();
  }, 1);

  return null;
};

export const DriverCameraView = () => (
  <div className="canvas-container driver-view">
    <AutopilotController enabled />
    <Suspense fallback={<div className="canvas-fallback">Loading cockpit…</div>}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [-0.36, 0.96, 1.9], fov: 62, near: 0.01, far: 500 }}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
      >
        <ExteriorScene />
        <TrafficVehiclesBridge />
        <DriverCameraRig />
        <PostProcessing />
      </Canvas>
    </Suspense>
    <DriverInteriorOverlay />
    <DashboardConsole />
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
