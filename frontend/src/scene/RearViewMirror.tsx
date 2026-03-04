import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

const MIRROR_WIDTH = 256;
const MIRROR_HEIGHT = 96;
const MIRROR_FOV = 45;

export function RearViewMirror() {
  const { gl, scene } = useThree();
  const mirrorMeshRef = useRef<THREE.Mesh>(null);

  const renderTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(MIRROR_WIDTH, MIRROR_HEIGHT, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
    });
  }, []);

  const mirrorCamera = useMemo(() => {
    return new THREE.PerspectiveCamera(
      MIRROR_FOV,
      MIRROR_WIDTH / MIRROR_HEIGHT,
      0.5,
      400
    );
  }, []);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const player = store.player;
    const laneCount = store.routeGeometry?.laneCount ?? 4;
    const halfRoad = (laneCount * PHYSICS.LANE_WIDTH_METERS) / 2;
    const posX = (player.laneIndex + 0.5) * PHYSICS.LANE_WIDTH_METERS - halfRoad + player.lateralOffset;

    mirrorCamera.position.set(posX, 1.35, 0.1);
    mirrorCamera.lookAt(posX, 1.25, -60);

    if (mirrorMeshRef.current) {
      mirrorMeshRef.current.position.x = posX;
    }

    const currentRenderTarget = gl.getRenderTarget();
    gl.setRenderTarget(renderTarget);
    gl.render(scene, mirrorCamera);
    gl.setRenderTarget(currentRenderTarget);
  });

  useEffect(() => {
    return () => {
      renderTarget.dispose();
    };
  }, [renderTarget]);

  return (
    <group>
      {/* Mirror frame */}
      <mesh
        position={[0, 1.38, 0.72]}
        rotation={[-0.1, 0, 0]}
      >
        <boxGeometry args={[0.32, 0.1, 0.02]} />
        <meshStandardMaterial color={0x111111} roughness={0.85} metalness={0.15} />
      </mesh>
      {/* Mirror surface */}
      <mesh
        ref={mirrorMeshRef}
        position={[0, 1.38, 0.71]}
        rotation={[-0.1, Math.PI, 0]}
      >
        <planeGeometry args={[0.28, 0.07]} />
        <meshBasicMaterial map={renderTarget.texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
