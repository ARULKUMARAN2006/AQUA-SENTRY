import * as THREE from 'three';
import { LAKE } from './config';
import { waveHeight } from './waves';

/**
 * AlgaeParticleSystem — the algal load the machine is meant to remove.
 *
 *  • suspendedColony : drifting green motes through the whole water column
 *  • surface patches  : floating scum mats that follow the surface
 *  • bubbles         : released by active thrusters
 *
 * All three read their density from the shared lake algae concentration, so
 * switching the pump off visibly lets the lake get greener.
 */
export class AlgaeParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.concentration = 0.5;

    this._buildSuspended();
    this._buildSurfacePatches();
    this._buildBubbles();
    this._buildIntakePlume();
  }

  _buildSuspended() {
    const count = 9000;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const size = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * LAKE.radius * 0.92;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -0.25 - Math.pow(Math.random(), 1.6) * 7.5;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random();
      size[i] = 0.018 + Math.random() * 0.05;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    this.suspendedUniforms = {
      uTime: { value: 0 },
      uDensity: { value: 0.5 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    };

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: this.suspendedUniforms,
      vertexShader: /* glsl */`
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform float uDensity;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vSeed;

        void main() {
          vec3 p = position;
          float t = uTime * 0.25 + aSeed * 40.0;
          // Slow turbulent drift plus a gentle rise near the surface
          p.x += sin(t * 0.7 + p.z * 0.08) * 0.6;
          p.z += cos(t * 0.55 + p.x * 0.07) * 0.6;
          p.y += sin(t * 0.4 + aSeed * 6.28) * 0.25;

          // Cull by density: with low algae most motes simply disappear.
          vAlpha = step(aSeed, uDensity);

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * 300.0 * uPixelRatio / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          vec3 col = mix(vec3(0.20, 0.48, 0.16), vec3(0.42, 0.74, 0.22), vSeed);
          gl_FragColor = vec4(col, smoothstep(0.5, 0.05, r) * 0.55 * vAlpha);
        }
      `,
    });

    this.suspended = new THREE.Points(geo, mat);
    this.suspended.frustumCulled = false;
    this.scene.add(this.suspended);
  }

  _buildSurfacePatches() {
    const tex = makeScumTexture();
    const geo = new THREE.PlaneGeometry(1, 1, 12, 12);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.85,
    });

    this.patchCount = 46;
    this.patches = new THREE.InstancedMesh(geo, mat, this.patchCount);
    this.patches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.patches.frustumCulled = false;
    this.patches.renderOrder = 2;

    this.patchData = [];
    for (let i = 0; i < this.patchCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * (LAKE.radius * 0.8);
      this.patchData.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        s: 2.5 + Math.random() * 7,
        rot: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.05,
      });
    }
    this.scene.add(this.patches);
  }

  _buildBubbles() {
    const count = 900;
    this.bubbleCount = count;
    this.bubblePos = new Float32Array(count * 3);
    this.bubbleLife = new Float32Array(count);
    this.bubbleSize = new Float32Array(count);
    this.bubbleCursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.bubblePos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.bubbleLife, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.bubbleSize, 1));

    this.bubbleUniforms = { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.bubbleUniforms,
      vertexShader: /* glsl */`
        attribute float aLife;
        attribute float aSize;
        uniform float uPixelRatio;
        varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 300.0 * uPixelRatio / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vLife;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5 || vLife <= 0.0) discard;
          // Thin bright rim reads as an air bubble
          float rim = smoothstep(0.5, 0.34, r) - smoothstep(0.34, 0.16, r);
          float a = (0.22 + rim * 0.75) * vLife;
          gl_FragColor = vec4(vec3(0.85, 0.95, 1.0), a);
        }
      `,
    });
    this.bubbles = new THREE.Points(geo, mat);
    this.bubbles.frustumCulled = false;
    this.scene.add(this.bubbles);
  }

  /** Green plume drawn into the intake when the pump is drawing water. */
  _buildIntakePlume() {
    const geo = new THREE.ConeGeometry(0.30, 1.0, 14, 1, true);
    geo.rotateZ(Math.PI / 2);
    geo.translate(-0.5, 0, 0);
    this.plumeMaterial = new THREE.MeshBasicMaterial({
      color: 0x5d9b3a,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.plume = new THREE.Mesh(geo, this.plumeMaterial);
    this.plume.renderOrder = 6;
    this.scene.add(this.plume);
  }

  emitBubbles(origin, strength, dt) {
    const n = Math.min(24, Math.floor(strength * 90 * dt + Math.random()));
    for (let k = 0; k < n; k++) {
      const i = this.bubbleCursor;
      this.bubbleCursor = (this.bubbleCursor + 1) % this.bubbleCount;
      this.bubblePos[i * 3] = origin.x + (Math.random() - 0.5) * 0.16;
      this.bubblePos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.12;
      this.bubblePos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.16;
      this.bubbleLife[i] = 1;
      this.bubbleSize[i] = 0.02 + Math.random() * 0.05;
      this.bubbleVel = this.bubbleVel || new Float32Array(this.bubbleCount * 3);
      this.bubbleVel[i * 3] = (Math.random() - 0.5) * 0.12;
      this.bubbleVel[i * 3 + 1] = 0.35 + Math.random() * 0.5;
      this.bubbleVel[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
    }
  }

  update(dt, elapsed, { concentration, robot, flowRate, intakeLocal }) {
    this.concentration = concentration;
    this.suspendedUniforms.uTime.value = elapsed;
    this.suspendedUniforms.uDensity.value = concentration;

    // Surface patches drift and ride the wave field.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    this.patchData.forEach((d, i) => {
      const a = d.rot + elapsed * d.drift;
      const x = d.x + Math.cos(elapsed * 0.05 + i) * 1.5;
      const z = d.z + Math.sin(elapsed * 0.04 + i * 1.7) * 1.5;
      const y = waveHeight(x, z, elapsed) + 0.02;
      e.set(0, a, 0);
      q.setFromEuler(e);
      const grow = 0.15 + concentration * 1.15;
      p.set(x, y, z);
      s.set(d.s * grow, 1, d.s * grow);
      m.compose(p, q, s);
      this.patches.setMatrixAt(i, m);
    });
    this.patches.instanceMatrix.needsUpdate = true;
    this.patches.material.opacity = concentration * 0.85;
    this.patches.visible = concentration > 0.015;

    // Bubbles rise and pop.
    if (!this.bubbleVel) this.bubbleVel = new Float32Array(this.bubbleCount * 3);
    for (let i = 0; i < this.bubbleCount; i++) {
      if (this.bubbleLife[i] <= 0) continue;
      this.bubblePos[i * 3] += this.bubbleVel[i * 3] * dt;
      this.bubblePos[i * 3 + 1] += this.bubbleVel[i * 3 + 1] * dt;
      this.bubblePos[i * 3 + 2] += this.bubbleVel[i * 3 + 2] * dt;
      this.bubbleVel[i * 3 + 1] += 0.35 * dt;
      this.bubbleLife[i] -= dt * 0.55;
      if (this.bubblePos[i * 3 + 1] > 0.05) this.bubbleLife[i] = 0;
      if (this.bubbleLife[i] < 0) this.bubbleLife[i] = 0;
    }
    this.bubbles.geometry.attributes.position.needsUpdate = true;
    this.bubbles.geometry.attributes.aLife.needsUpdate = true;
    this.bubbles.geometry.attributes.aSize.needsUpdate = true;

    // Intake plume follows the robot.
    if (robot && intakeLocal) {
      this.plume.position.copy(intakeLocal);
      this.plume.quaternion.copy(robot.quaternion);
      this.plumeMaterial.opacity = flowRate * (0.10 + concentration * 0.30);
      this.plume.scale.set(1, 0.6 + concentration * 0.8, 0.6 + concentration * 0.8);
      this.plume.visible = flowRate > 0.01;
    }
  }

  dispose() {
    [this.suspended, this.patches, this.bubbles, this.plume].forEach((o) => {
      if (!o) return;
      o.geometry.dispose();
      o.material.dispose();
      this.scene.remove(o);
    });
  }
}

function makeScumTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  // Blob cluster so patches read as irregular scum rather than discs
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.6) * 110;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    const rad = 8 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const tone = 70 + Math.random() * 60;
    g.addColorStop(0, `rgba(${Math.floor(tone * 0.45)}, ${Math.floor(tone * 1.3)}, 40, 0.85)`);
    g.addColorStop(1, 'rgba(40, 90, 30, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fade the rim so patches have no hard edge
  const fade = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
