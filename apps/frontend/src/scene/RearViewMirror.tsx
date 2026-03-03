import { useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

const MIRROR_WIDTH = 256;
const MIRROR_HEIGHT = 96;
const MIRROR_FOV = 50;

export function RearViewMirror() {
  const { gl, scene } = useThree();

  const renderTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(MIRROR_WIDTH, MIRROR_HEIGHT, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
    });
  }, []);

  const mirrorCamera = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(
      MIRROR_FOV,
      MIRROR_WIDTH / MIRROR_HEIGHT,
      0.5,
      400
    );
    return cam;
  }, []);

  useFrame(() => {
    const store = useSimulationStore.getState();
    const player = store.player;
    const posX = player.laneIndex * PHYSICS.LANE_WIDTH_METERS + player.lateralOffset;

    mirrorCamera.position.set(posX, 1.4, -0.5);
    mirrorCamera.lookAt(posX, 1.3, -50);

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
    <mesh position={[0, 1.55, 0.15]} rotation={[0.05, Math.PI, 0]}>
      <planeGeometry args={[0.34, 0.12]} />
      <meshBasicMaterial map={renderTarget.texture} toneMapped={false} />
    </mesh>
  );
}
