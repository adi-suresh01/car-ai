import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Overcast/hazy sky dome — soft countryside atmosphere.
 * Muted blue-gray top, warm beige horizon, greenish below.
 */
function SkyDome() {
  const skyMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x8899aa) },
        uHorizonColor: { value: new THREE.Color(0xc5b9a8) },
        uBottomColor: { value: new THREE.Color(0x9aaa88) },
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
        varying vec3 vWorldPos;

        void main() {
          float height = normalize(vWorldPos).y;

          vec3 color;
          if (height > 0.0) {
            float t = smoothstep(0.0, 0.45, height);
            color = mix(uHorizonColor, uTopColor, t);
          } else {
            float t = smoothstep(0.0, -0.25, height);
            color = mix(uHorizonColor, uBottomColor, t);
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }, []);

  return (
    <mesh material={skyMat}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  );
}

/**
 * Soft, flat cloud planes drifting gently across the sky.
 */
function Clouds() {
  const groupRef = useRef<THREE.Group>(null);

  const cloudData = useMemo(() => {
    const clouds: Array<{
      x: number;
      y: number;
      z: number;
      scaleX: number;
      scaleZ: number;
      opacity: number;
      speed: number;
      rotY: number;
    }> = [];
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = 200 + Math.random() * 500;
      clouds.push({
        x: Math.cos(angle) * dist,
        y: 120 + Math.random() * 130,
        z: Math.sin(angle) * dist,
        scaleX: 30 + Math.random() * 50,
        scaleZ: 20 + Math.random() * 40,
        opacity: 0.15 + Math.random() * 0.1,
        speed: 0.5 + Math.random() * 1.0,
        rotY: Math.random() * Math.PI,
      });
    }
    return clouds;
  }, []);

  const cloudMat = useMemo(
    () =>
      cloudData.map(
        (c) =>
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: c.opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
      ),
    [cloudData]
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        child.position.x += cloudData[i].speed * delta;
        if (child.position.x > 800) child.position.x = -800;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {cloudData.map((cloud, i) => (
        <mesh
          key={i}
          position={[cloud.x, cloud.y, cloud.z]}
          rotation={[-Math.PI / 2, 0, cloud.rotY]}
          scale={[cloud.scaleX, cloud.scaleZ, 1]}
          material={cloudMat[i]}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Gentle rolling hills at multiple distances — organic half-sphere shapes.
 * Near hills are warm green, far hills are blue-tinted for atmospheric perspective.
 */
function RollingHills() {
  const nearHillMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x4a6b35,
        roughness: 0.95,
        metalness: 0,
      }),
    []
  );

  const farHillMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x5a7a6a,
        roughness: 0.95,
        metalness: 0,
      }),
    []
  );

  const nearHillGeo = useMemo(
    () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    []
  );

  const farHillGeo = useMemo(
    () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    []
  );

  const nearHills = useMemo(() => {
    const hills: Array<{
      x: number;
      z: number;
      radiusX: number;
      radiusZ: number;
      height: number;
    }> = [];
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 300 + Math.random() * 200;
      hills.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        radiusX: 80 + Math.random() * 70,
        radiusZ: 80 + Math.random() * 70,
        height: 20 + Math.random() * 40,
      });
    }
    return hills;
  }, []);

  const farHills = useMemo(() => {
    const hills: Array<{
      x: number;
      z: number;
      radiusX: number;
      radiusZ: number;
      height: number;
    }> = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 500 + Math.random() * 200;
      hills.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        radiusX: 100 + Math.random() * 80,
        radiusZ: 100 + Math.random() * 80,
        height: 40 + Math.random() * 60,
      });
    }
    return hills;
  }, []);

  return (
    <group>
      {nearHills.map((h, i) => (
        <mesh
          key={`near-${i}`}
          geometry={nearHillGeo}
          material={nearHillMat}
          position={[h.x, 0, h.z]}
          scale={[h.radiusX, h.height, h.radiusZ]}
        />
      ))}
      {farHills.map((h, i) => (
        <mesh
          key={`far-${i}`}
          geometry={farHillGeo}
          material={farHillMat}
          position={[h.x, 0, h.z]}
          scale={[h.radiusX, h.height, h.radiusZ]}
        />
      ))}
    </group>
  );
}

/**
 * Dense forest backdrop — clusters of narrow cone-shaped trees
 * at medium distance, creating a dark green treeline.
 */
function ForestBackdrop() {
  const treeGeo = useMemo(
    () => new THREE.ConeGeometry(1, 1, 6),
    []
  );

  const treeMaterials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: 0x2a4a22, roughness: 0.9, metalness: 0 }),
      new THREE.MeshStandardMaterial({ color: 0x1a3a18, roughness: 0.9, metalness: 0 }),
      new THREE.MeshStandardMaterial({ color: 0x224020, roughness: 0.9, metalness: 0 }),
    ],
    []
  );

  const trees = useMemo(() => {
    const result: Array<{
      x: number;
      z: number;
      height: number;
      radius: number;
      matIndex: number;
    }> = [];

    // Create 10 clusters of 5-8 trees each
    for (let cluster = 0; cluster < 10; cluster++) {
      const clusterAngle =
        (cluster / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const clusterDist = 150 + Math.random() * 250;
      const cx = Math.cos(clusterAngle) * clusterDist;
      const cz = Math.sin(clusterAngle) * clusterDist;
      const treeCount = 5 + Math.floor(Math.random() * 4);

      for (let t = 0; t < treeCount; t++) {
        const ox = (Math.random() - 0.5) * 40;
        const oz = (Math.random() - 0.5) * 40;
        result.push({
          x: cx + ox,
          z: cz + oz,
          height: 8 + Math.random() * 7,
          radius: 2 + Math.random() * 1.5,
          matIndex: Math.floor(Math.random() * 3),
        });
      }
    }
    return result;
  }, []);

  return (
    <group>
      {trees.map((tree, i) => (
        <mesh
          key={i}
          geometry={treeGeo}
          material={treeMaterials[tree.matIndex]}
          position={[tree.x, tree.height / 2, tree.z]}
          scale={[tree.radius, tree.height, tree.radius]}
        />
      ))}
    </group>
  );
}

/**
 * Countryside environment: overcast sky, rolling hills, forest treeline,
 * soft clouds, and warm atmospheric fog. Inspired by SlowRoads.io.
 */
export function SceneEnvironment() {
  return (
    <>
      <SkyDome />
      <Clouds />
      <RollingHills />
      <ForestBackdrop />

      {/* Soft directional sun — warm but not harsh */}
      <directionalLight
        position={[80, 100, 60]}
        intensity={0.9}
        color={0xfff0dd}
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

      {/* Warmer, stronger ambient */}
      <ambientLight color={0x8a9080} intensity={0.65} />

      {/* Hemisphere: gray sky, green ground */}
      <hemisphereLight args={[0x99aabb, 0x556633, 0.4]} />

      {/* Warm atmospheric fog — key to the SlowRoads look */}
      <fog attach="fog" args={["#b8b0a0", 80, 450]} />
    </>
  );
}
