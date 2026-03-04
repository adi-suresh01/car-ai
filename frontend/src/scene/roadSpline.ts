import * as THREE from "three";
import type { RouteGeometry, RouteControlPoint, TurnDirection, RouteSummary } from "../models/types";

const SAMPLE_INTERVAL = 2;

export interface SplineSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  s: number;
  curvature: number;
}

export function sampleSpline(geometry: RouteGeometry): SplineSample[] {
  const points = geometry.controlPoints;
  if (points.length < 2) return [];

  const curvePoints = points.map((cp) => new THREE.Vector3(cp.x, 0, cp.z));
  const catmull = new THREE.CatmullRomCurve3(curvePoints, false, "catmullrom", 0.5);

  const sampleCount = Math.ceil(geometry.totalLength / SAMPLE_INTERVAL);
  const samples: SplineSample[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const position = catmull.getPointAt(t);
    const tangent = catmull.getTangentAt(t).normalize();
    const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const s = t * geometry.totalLength;

    const cpIdx = findNearestControlPoint(points, s);
    const curvature = cpIdx >= 0 ? points[cpIdx].curvature : 0;

    samples.push({ position, tangent, normal, s, curvature });
  }

  return samples;
}

function findNearestControlPoint(points: RouteControlPoint[], s: number): number {
  let best = 0;
  let bestDist = Math.abs(points[0].s - s);
  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(points[i].s - s);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export function findSampleAtS(samples: SplineSample[], s: number): { sample: SplineSample; index: number } {
  if (samples.length === 0) {
    return {
      sample: { position: new THREE.Vector3(), tangent: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(1, 0, 0), s: 0, curvature: 0 },
      index: 0,
    };
  }

  const idx = Math.round(s / SAMPLE_INTERVAL);
  const clamped = Math.max(0, Math.min(idx, samples.length - 1));
  return { sample: samples[clamped], index: clamped };
}

export function interpolateSampleAtS(samples: SplineSample[], s: number): SplineSample {
  if (samples.length === 0) {
    return { position: new THREE.Vector3(), tangent: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(1, 0, 0), s: 0, curvature: 0 };
  }

  const rawIdx = s / SAMPLE_INTERVAL;
  const i0 = Math.max(0, Math.min(Math.floor(rawIdx), samples.length - 2));
  const i1 = i0 + 1;
  const frac = rawIdx - i0;

  const a = samples[i0];
  const b = samples[Math.min(i1, samples.length - 1)];

  return {
    position: new THREE.Vector3().lerpVectors(a.position, b.position, frac),
    tangent: new THREE.Vector3().lerpVectors(a.tangent, b.tangent, frac).normalize(),
    normal: new THREE.Vector3().lerpVectors(a.normal, b.normal, frac).normalize(),
    s: a.s + (b.s - a.s) * frac,
    curvature: a.curvature + (b.curvature - a.curvature) * frac,
  };
}

export interface RoadMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export function buildRoadMesh(
  samples: SplineSample[],
  laneCount: number,
  laneWidth: number
): RoadMeshData {
  const halfWidth = (laneCount * laneWidth) / 2 + 1.0;
  const verticesPerRow = 2;
  const vertexCount = samples.length * verticesPerRow;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indexCount = (samples.length - 1) * 6;
  const indices = new Uint32Array(indexCount);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const base = i * verticesPerRow;

    const leftX = sample.position.x + sample.normal.x * halfWidth;
    const leftZ = sample.position.z + sample.normal.z * halfWidth;
    const rightX = sample.position.x - sample.normal.x * halfWidth;
    const rightZ = sample.position.z - sample.normal.z * halfWidth;

    positions[base * 3] = leftX;
    positions[base * 3 + 1] = 0.05;
    positions[base * 3 + 2] = leftZ;

    positions[(base + 1) * 3] = rightX;
    positions[(base + 1) * 3 + 1] = 0.05;
    positions[(base + 1) * 3 + 2] = rightZ;

    normals[base * 3] = 0;
    normals[base * 3 + 1] = 1;
    normals[base * 3 + 2] = 0;
    normals[(base + 1) * 3] = 0;
    normals[(base + 1) * 3 + 1] = 1;
    normals[(base + 1) * 3 + 2] = 0;

    const uFrac = sample.s / (laneCount * laneWidth * 2);
    uvs[base * 2] = 0;
    uvs[base * 2 + 1] = uFrac;
    uvs[(base + 1) * 2] = 1;
    uvs[(base + 1) * 2 + 1] = uFrac;
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const base = i * verticesPerRow;
    const next = (i + 1) * verticesPerRow;
    const idx = i * 6;

    indices[idx] = base;
    indices[idx + 1] = next;
    indices[idx + 2] = base + 1;
    indices[idx + 3] = base + 1;
    indices[idx + 4] = next;
    indices[idx + 5] = next + 1;
  }

  return { positions, normals, uvs, indices };
}

export interface LaneMarkingData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export function buildLaneMarkings(
  samples: SplineSample[],
  laneCount: number,
  laneWidth: number
): { dashed: LaneMarkingData[]; solid: LaneMarkingData[] } {
  const dashed: LaneMarkingData[] = [];
  const solid: LaneMarkingData[] = [];
  const markingWidth = 0.15;

  for (let lane = 0; lane <= laneCount; lane++) {
    const offset = lane * laneWidth - (laneCount * laneWidth) / 2;
    const isEdge = lane === 0 || lane === laneCount;

    if (isEdge) {
      solid.push(buildMarkingStrip(samples, offset, markingWidth, false));
    } else {
      dashed.push(buildMarkingStrip(samples, offset, markingWidth, true));
    }
  }

  return { dashed, solid };
}

function buildMarkingStrip(
  samples: SplineSample[],
  lateralOffset: number,
  width: number,
  isDashed: boolean
): LaneMarkingData {
  const halfW = width / 2;
  const dashLength = 3;
  const gapLength = 6;
  const cycleLength = dashLength + gapLength;

  const filteredSamples = isDashed
    ? samples.filter((s) => (s.s % cycleLength) < dashLength)
    : samples;

  const count = filteredSamples.length;
  const positions = new Float32Array(count * 2 * 3);
  const normals = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);

  for (let i = 0; i < count; i++) {
    const s = filteredSamples[i];
    const centerX = s.position.x + s.normal.x * lateralOffset;
    const centerZ = s.position.z + s.normal.z * lateralOffset;

    const leftX = centerX + s.normal.x * halfW;
    const leftZ = centerZ + s.normal.z * halfW;
    const rightX = centerX - s.normal.x * halfW;
    const rightZ = centerZ - s.normal.z * halfW;

    const base = i * 2;
    positions[base * 3] = leftX;
    positions[base * 3 + 1] = 0.07;
    positions[base * 3 + 2] = leftZ;
    positions[(base + 1) * 3] = rightX;
    positions[(base + 1) * 3 + 1] = 0.03;
    positions[(base + 1) * 3 + 2] = rightZ;

    normals[base * 3 + 1] = 1;
    normals[(base + 1) * 3 + 1] = 1;

    uvs[base * 2] = 0;
    uvs[base * 2 + 1] = s.s;
    uvs[(base + 1) * 2] = 1;
    uvs[(base + 1) * 2 + 1] = s.s;
  }

  const indices = isDashed
    ? buildDashedIndices(filteredSamples, cycleLength)
    : buildContinuousIndices(count);

  return { positions, normals, uvs, indices };
}

function buildDashedIndices(samples: SplineSample[], cycleLength: number): Uint32Array {
  const tris: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const sCurr = samples[i].s % cycleLength;
    const sNext = samples[i + 1].s % cycleLength;
    if (sNext <= sCurr) continue;

    const base = i * 2;
    const next = (i + 1) * 2;
    tris.push(base, next, base + 1, base + 1, next, next + 1);
  }
  return new Uint32Array(tris);
}

function buildContinuousIndices(vertexRows: number): Uint32Array {
  const indices = new Uint32Array((vertexRows - 1) * 6);
  for (let i = 0; i < vertexRows - 1; i++) {
    const base = i * 2;
    const next = (i + 1) * 2;
    const idx = i * 6;
    indices[idx] = base;
    indices[idx + 1] = next;
    indices[idx + 2] = base + 1;
    indices[idx + 3] = base + 1;
    indices[idx + 4] = next;
    indices[idx + 5] = next + 1;
  }
  return indices;
}

export function buildGuardrailPositions(
  samples: SplineSample[],
  laneCount: number,
  laneWidth: number,
  spacing: number
): { left: THREE.Matrix4[]; right: THREE.Matrix4[] } {
  const halfWidth = (laneCount * laneWidth) / 2 + 2.0;
  const left: THREE.Matrix4[] = [];
  const right: THREE.Matrix4[] = [];

  const tempPos = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const tempScale = new THREE.Vector3(1, 1, 1);
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < samples.length; i += Math.round(spacing / SAMPLE_INTERVAL)) {
    const s = samples[i];
    const angle = Math.atan2(s.tangent.x, s.tangent.z);
    tempQuat.setFromAxisAngle(upVec, angle);

    tempPos.set(
      s.position.x + s.normal.x * halfWidth,
      0.4,
      s.position.z + s.normal.z * halfWidth
    );
    const leftMat = new THREE.Matrix4().compose(tempPos.clone(), tempQuat, tempScale);
    left.push(leftMat);

    tempPos.set(
      s.position.x - s.normal.x * halfWidth,
      0.4,
      s.position.z - s.normal.z * halfWidth
    );
    const rightMat = new THREE.Matrix4().compose(tempPos.clone(), tempQuat, tempScale);
    right.push(rightMat);
  }

  return { left, right };
}

export function buildTreePositions(
  samples: SplineSample[],
  laneCount: number,
  laneWidth: number,
  count: number,
  seed: number
): Array<{ position: THREE.Vector3; scale: number; trunkHeight: number }> {
  const halfWidth = (laneCount * laneWidth) / 2;
  const trees: Array<{ position: THREE.Vector3; scale: number; trunkHeight: number }> = [];

  function seededRandom(n: number): number {
    const x = Math.sin(seed + n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }

  for (let i = 0; i < count; i++) {
    const sampleIdx = Math.floor(seededRandom(i * 3) * samples.length);
    const sample = samples[Math.min(sampleIdx, samples.length - 1)];
    const side = seededRandom(i * 3 + 1) > 0.5 ? 1 : -1;
    const dist = halfWidth + 8 + seededRandom(i * 3 + 2) * 50;

    const pos = new THREE.Vector3(
      sample.position.x + sample.normal.x * dist * side,
      0,
      sample.position.z + sample.normal.z * dist * side
    );

    trees.push({
      position: pos,
      scale: 0.7 + seededRandom(i * 7) * 0.8,
      trunkHeight: 2 + seededRandom(i * 11) * 2,
    });
  }

  return trees;
}

export function generateMockRouteGeometry(): RouteGeometry {
  const controlPoints: RouteControlPoint[] = [];
  let x = 0;
  let z = 0;
  let heading = 0;
  let s = 0;

  const segments = [
    { length: 200, curvature: 0 },
    { length: 150, curvature: 0.004 },
    { length: 100, curvature: 0 },
    { length: 180, curvature: -0.005 },
    { length: 120, curvature: 0 },
    { length: 200, curvature: 0.003 },
    { length: 80, curvature: 0 },
    { length: 160, curvature: -0.008 },
    { length: 100, curvature: 0 },
    { length: 140, curvature: 0.006 },
    { length: 200, curvature: 0 },
    { length: 250, curvature: -0.003 },
    { length: 100, curvature: 0 },
    { length: 180, curvature: 0.010 },
    { length: 80, curvature: 0 },
    { length: 120, curvature: -0.012 },
    { length: 160, curvature: 0 },
    { length: 200, curvature: 0.004 },
    { length: 140, curvature: 0 },
    { length: 180, curvature: -0.006 },
    { length: 200, curvature: 0 },
    { length: 160, curvature: 0.008 },
    { length: 120, curvature: 0 },
    { length: 200, curvature: -0.004 },
    { length: 300, curvature: 0 },
  ];

  const step = 10;

  for (const seg of segments) {
    const steps = Math.ceil(seg.length / step);
    for (let i = 0; i < steps; i++) {
      controlPoints.push({
        x, z, heading,
        curvature: seg.curvature,
        s,
      });

      heading += seg.curvature * step;
      x += Math.sin(heading) * step;
      z += Math.cos(heading) * step;
      s += step;
    }
  }

  controlPoints.push({ x, z, heading, curvature: 0, s });

  return {
    controlPoints,
    laneCount: 4,
    laneWidth: 3.6,
    totalLength: s,
    speedLimits: [
      { s: 0, speedMph: 65 },
      { s: 800, speedMph: 45 },
      { s: 1200, speedMph: 35 },
      { s: 1800, speedMph: 55 },
      { s: 2500, speedMph: 65 },
    ],
  };
}

export function generateMockDirections(geometry: RouteGeometry): TurnDirection[] {
  const directions: TurnDirection[] = [];
  const points = geometry.controlPoints;

  directions.push({
    instruction: "Head north on Highway 17",
    distanceMeters: 0,
    s: 0,
    turnType: "straight",
  });

  let prevCurv = 0;
  for (let i = 1; i < points.length; i++) {
    const cp = points[i];
    if (Math.abs(cp.curvature) > 0.002 && Math.abs(prevCurv) <= 0.002) {
      const isRight = cp.curvature > 0;
      const intensity = Math.abs(cp.curvature);
      let turnType: TurnDirection["turnType"];
      let desc: string;

      if (intensity > 0.009) {
        turnType = isRight ? "sharp_right" : "sharp_left";
        desc = isRight ? "Sharp right curve" : "Sharp left curve";
      } else if (intensity > 0.005) {
        turnType = isRight ? "right" : "left";
        desc = isRight ? "Right curve ahead" : "Left curve ahead";
      } else {
        turnType = isRight ? "slight_right" : "slight_left";
        desc = isRight ? "Slight right curve" : "Slight left curve";
      }

      const distFromPrev = directions.length > 0
        ? cp.s - directions[directions.length - 1].s
        : cp.s;

      directions.push({
        instruction: desc,
        distanceMeters: distFromPrev,
        s: cp.s,
        turnType,
      });
    }
    prevCurv = cp.curvature;
  }

  directions.push({
    instruction: "Arrive at destination",
    distanceMeters: geometry.totalLength - (directions[directions.length - 1]?.s ?? 0),
    s: geometry.totalLength,
    turnType: "arrive",
  });

  return directions;
}

export function generateMockRouteSummary(geometry: RouteGeometry, directions: TurnDirection[]): RouteSummary {
  const previewPolyline: Array<[number, number]> = [];
  const step = Math.max(1, Math.floor(geometry.controlPoints.length / 100));
  for (let i = 0; i < geometry.controlPoints.length; i += step) {
    const cp = geometry.controlPoints[i];
    previewPolyline.push([cp.x, cp.z]);
  }

  return {
    distance: geometry.totalLength,
    duration: geometry.totalLength / 25,
    turnCount: directions.filter((d) => d.turnType !== "straight" && d.turnType !== "arrive").length,
    previewPolyline,
  };
}
