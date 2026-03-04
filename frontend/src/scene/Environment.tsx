import { useMemo } from "react";
import { Sky } from "@react-three/drei";

export function SceneEnvironment() {
  const sunPosition = useMemo<[number, number, number]>(
    () => [200, 80, 100],
    []
  );

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={sunPosition}
        inclination={0.52}
        azimuth={0.25}
        rayleigh={0.5}
        turbidity={2}
        mieCoefficient={0.003}
        mieDirectionalG={0.85}
      />

      <ambientLight intensity={0.4} color={0xddeeff} />

      <directionalLight
        position={[200, 100, 100]}
        intensity={0.8}
        color={0xfff8f0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-bias={-0.0005}
      />

      <hemisphereLight
        color={0x88aacc}
        groundColor={0x445533}
        intensity={0.35}
      />

      <fog attach="fog" args={[0x99bbdd, 400, 1200]} />
    </>
  );
}
