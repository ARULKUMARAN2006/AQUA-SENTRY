import * as THREE from 'three';
import { WAVES, LAKE } from './config';

// ---------------------------------------------------------------------------
// Wave model shared by the water shader and the buoyancy controller.
// Sum-of-sines so the CPU sampler and the GPU displacement agree exactly.
// ---------------------------------------------------------------------------

const K = WAVES.map((w) => (Math.PI * 2) / w.len);
const OMEGA = WAVES.map((w) => (K[w] ? 0 : 0));
const SPEED = WAVES.map((w) => w.speed);

// Normalise the direction vectors once.
const DIRS = WAVES.map((w) => {
  const l = Math.hypot(w.dir[0], w.dir[1]) || 1;
  return [w.dir[0] / l, w.dir[1] / l];
});

OMEGA.forEach((_, i) => { OMEGA[i] = K[i] * SPEED[i]; });

export const WAVE_COUNT = WAVES.length;

/** Surface height at (x, z) for time t. */
export function waveHeight(x, z, t) {
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    h += WAVES[i].amp * Math.sin(K[i] * (DIRS[i][0] * x + DIRS[i][1] * z) - OMEGA[i] * t);
  }
  return h;
}

/** Surface gradient (dh/dx, dh/dz) at (x, z). */
export function waveGradient(x, z, t, out = { x: 0, z: 0 }) {
  let dx = 0;
  let dz = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const c = WAVES[i].amp * K[i] * Math.cos(K[i] * (DIRS[i][0] * x + DIRS[i][1] * z) - OMEGA[i] * t);
    dx += c * DIRS[i][0];
    dz += c * DIRS[i][1];
  }
  out.x = dx;
  out.z = dz;
  return out;
}

/** GLSL constants generated from the same table. */
export function waveUniformsData() {
  return WAVES.map((w, i) => new THREE.Vector4(DIRS[i][0], DIRS[i][1], K[i], OMEGA[i]));
}

/** GLSL snippet: returns height and accumulates the gradient. */
export const WAVE_GLSL = /* glsl */ `
  const int WAVE_COUNT = ${WAVES.length};
  uniform vec4 uWaves[WAVE_COUNT];   // dirX, dirZ, k, omega
  uniform vec4 uWaveAmp[WAVE_COUNT];  // amp, 0, 0, 0

  void addWaves(vec2 p, float t, out float h, out vec2 grad) {
    h = 0.0;
    grad = vec2(0.0);
    for (int i = 0; i < WAVE_COUNT; i++) {
      vec2 d = uWaves[i].xy;
      float k = uWaves[i].z;
      float w = uWaves[i].w;
      float a = uWaveAmp[i].x;
      float f = k * dot(d, p) - w * t;
      h += a * sin(f);
      grad += a * k * cos(f) * d;
    }
  }
`;

// ---------------------------------------------------------------------------
// Shoreline / terrain. Also shared so the water shader can colour the shallows
// and know where the bank is.
// ---------------------------------------------------------------------------

/** Angular radius of the shoreline (irregular, natural-looking). */
export function shoreRadius(theta) {
  return LAKE.radius
    + 7.5 * Math.sin(3.0 * theta + 0.6)
    + 4.5 * Math.cos(5.0 * theta - 1.1)
    + 2.5 * Math.sin(7.0 * theta + 2.3);
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Terrain height above the waterline at (x, z). Negative = lake bed. */
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const shore = shoreRadius(theta);

  const inner = shore - LAKE.shoreWidth;
  if (r < inner) {
    // Lake bed: deepest at the centre, rising gently to the shore.
    const t = r / inner;
    return -LAKE.bedDepth * (1 - t * t) - 0.35;
  }

  const t = smoothstep(inner, shore + LAKE.shoreWidth * 0.9, r);
  const bank = t * 3.2;
  const hills = smoothstep(shore + LAKE.shoreWidth * 0.4, shore + LAKE.shoreWidth * 2.6, r);
  const noise = Math.sin(x * 0.035 + 1.3) * Math.cos(z * 0.031 - 0.7) * 2.1
    + Math.sin(x * 0.09 - 2.1) * Math.cos(z * 0.075 + 0.4) * 0.8;
  return bank + hills * (LAKE.hillHeight * 0.55 + noise);
}

export const TERRAIN_GLSL = /* glsl */ `
  uniform float uLakeRadius;
  uniform float uShoreWidth;

  float shoreRadiusGLSL(float theta) {
    return uLakeRadius
      + 7.5 * sin(3.0 * theta + 0.6)
      + 4.5 * cos(5.0 * theta - 1.1)
      + 2.5 * sin(7.0 * theta + 2.3);
  }

  float terrainHeightGLSL(vec2 p) {
    float r = length(p);
    float theta = atan(p.y, p.x);
    float shore = shoreRadiusGLSL(theta);
    float inner = shore - uShoreWidth;
    if (r < inner) {
      float t = r / inner;
      return -7.5 * (1.0 - t * t) - 0.35;
    }
    float tt = smoothstep(inner, shore + uShoreWidth * 0.9, r);
    float hills = smoothstep(shore + uShoreWidth * 0.4, shore + uShoreWidth * 2.6, r);
    float noise = sin(p.x * 0.035 + 1.3) * cos(p.y * 0.031 - 0.7) * 2.1
      + sin(p.x * 0.09 - 2.1) * cos(p.y * 0.075 + 0.4) * 0.8;
    return tt * 3.2 + hills * (4.95 + noise);
  }
`;
