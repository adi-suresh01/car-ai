import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Stylized sky gradient — warm sunset-to-blue transition.
 * Replaces HDRI for a more animated/game-like look.
 */
function SkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);

  const skyMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uTopColor: { value: new THREE.Color(0x1a2a4a) },
        uHorizonColor: { value: new THREE.Color(0xf0a060) },
        uBottomColor: { value: new THREE.Color(0x7ab0d0) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uBottomColor;
        uniform float uTime;
        varying vec3 vWorldPos;

        void main() {
          float height = normalize(vWorldPos).y;

          // Smooth gradient: bottom → horizon → top
          vec3 color;
          if (height > 0.0) {
            float t = smoothstep(0.0, 0.5, height);
            color = mix(uHorizonColor, uTopColor, t);
          } else {
            float t = smoothstep(0.0, -0.3, height);
            color = mix(uHorizonColor, uBottomColor, t);
          }

          // Subtle sun glow near horizon
          float sunAngle = atan(vWorldPos.z, vWorldPos.x) + uTime * 0.01;
          float sunGlow = smoothstep(0.95, 1.0, cos(sunAngle)) * smoothstep(0.1, 0.0, abs(height));
          color += vec3(1.0, 0.7, 0.3) * sunGlow * 0.4;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }, []);

  useFrame((_, delta) => {
    skyMat.uniforms.uTime.value += delta;
  });

  return (
    <mesh ref={meshRef} material={skyMat}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  );
}

/**
 * Animated low-poly clouds drifting across the sky
 */
function Clouds() {
  const groupRef = useRef<THREE.Group>(null);

  const cloudPositions = useMemo(() => {
    const clouds: Array<{ x: number; y: number; z: number; scale: number; speed: number }> = [];
    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 500 + Math.random() * 300;
      clouds.push({
        x: Math.cos(angle) * dist,
        y: 150 + Math.random() * 120,
        z: Math.sin(angle) * dist,
        scale: 8 + Math.random() * 12,
        speed: 0.3 + Math.random() * 0.8,
      });
    }
    return clouds;
  }, []);

  const cloudMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xeeeeff,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.35,
        flatShading: true,
        depthWrite: false,
      }),
    []
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        child.position.x += cloudPositions[i].speed * delta * 2;
        if (child.position.x > 700) child.position.x = -700;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {cloudPositions.map((cloud, i) => (
        <mesh key={i} position={[cloud.x, cloud.y, cloud.z]} material={cloudMat}>
          <dodecahedronGeometry args={[cloud.scale, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Distant animated mountain silhouettes
 */
function Mountains() {
  const mountainMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x3a5a3a,
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }),
    []
  );

  const snowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xddeeff,
        roughness: 0.8,
        metalness: 0,
        flatShading: true,
      }),
    []
  );

  const mountains = useMemo(() => {
    const peaks: Array<{ x: number; z: number; height: number; radius: number; rotation: number }> = [];
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const dist = 500 + Math.random() * 200;
      peaks.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        height: 60 + Math.random() * 120,
        radius: 40 + Math.random() * 60,
        rotation: Math.random() * Math.PI,
      });
    }
    return peaks;
  }, []);

  return (
    <group>
      {mountains.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]} rotation={[0, m.rotation, 0]}>
          {/* Mountain body */}
          <mesh material={mountainMat}>
            <coneGeometry args={[m.radius, m.height, 6]} />
          </mesh>
          {/* Snow cap */}
          <mesh position={[0, m.height * 0.35, 0]} material={snowMat}>
            <coneGeometry args={[m.radius * 0.35, m.height * 0.3, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function SceneEnvironment() {
  return (
    <>
      <SkyDome />
      <Clouds />
      <Mountains />

      {/* Warm directional sunlight */}
      <directionalLight
        position={[100, 60, 80]}
        intensity={1.2}
        color={0xffeedd}
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

      {/* Ambient fill — warm tint */}
      <ambientLight color={0x607090} intensity={0.5} />

      {/* Hemisphere light for sky-ground contrast */}
      <hemisphereLight args={[0x88bbff, 0x445522, 0.3]} />

      {/* Stylized fog — shorter range for game feel */}
      <fog attach="fog" args={["#c0d8e8", 150, 600]} />
    </>
  );
}
