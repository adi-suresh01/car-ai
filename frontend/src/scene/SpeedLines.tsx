import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../state/simulationStore";
import { PHYSICS } from "../models/types";

const PARTICLE_COUNT = 200;
const SPAWN_RADIUS = 4;
const LINE_LENGTH_BASE = 0.8;
const LINE_LENGTH_SPEED_SCALE = 3.0;
const SPEED_THRESHOLD_MPH = 40;

export function SpeedLines() {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const { geometry, velocities, lifetimes } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const alphas = new Float32Array(PARTICLE_COUNT);
    const vels = new Float32Array(PARTICLE_COUNT);
    const lives = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * SPAWN_RADIUS * 2;
      positions[i * 3 + 1] = Math.random() * 3 + 0.5;
      positions[i * 3 + 2] = Math.random() * 60 - 5;
      sizes[i] = 1.5 + Math.random() * 2;
      alphas[i] = 0;
      vels[i] = 0.4 + Math.random() * 0.6;
      lives[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));

    return { geometry: geo, velocities: vels, lifetimes: lives };
  }, []);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0.7, 0.8, 1.0) },
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float fade = 1.0 - smoothstep(0.0, 0.5, d);
          gl_FragColor = vec4(uColor, vAlpha * fade * 0.6);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useFrame((_, delta) => {
    timeRef.current += delta;

    const store = useSimulationStore.getState();
    const speedMph = store.player.speedMph;
    const speedRatio = Math.max(0, (speedMph - SPEED_THRESHOLD_MPH) / (PHYSICS.MAX_SPEED_MPH - SPEED_THRESHOLD_MPH));
    const posX = store.player.laneIndex * PHYSICS.LANE_WIDTH_METERS + store.player.lateralOffset;

    if (speedRatio <= 0 || !pointsRef.current) return;

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const alphas = geometry.attributes.alpha as THREE.BufferAttribute;
    const posArray = positions.array as Float32Array;
    const alphaArray = alphas.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      lifetimes[i] += delta * velocities[i] * (1 + speedRatio * 3);

      if (lifetimes[i] > 1) {
        lifetimes[i] = 0;
        posArray[i * 3] = posX + (Math.random() - 0.5) * SPAWN_RADIUS * 2;
        posArray[i * 3 + 1] = Math.random() * 3 + 0.3;
        posArray[i * 3 + 2] = 20 + Math.random() * 40;
      }

      posArray[i * 3 + 2] -= delta * speedRatio * 80 * velocities[i];

      const lifeFade = lifetimes[i] < 0.1
        ? lifetimes[i] / 0.1
        : lifetimes[i] > 0.8
          ? (1 - lifetimes[i]) / 0.2
          : 1;

      alphaArray[i] = speedRatio * lifeFade;
    }

    positions.needsUpdate = true;
    alphas.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}
