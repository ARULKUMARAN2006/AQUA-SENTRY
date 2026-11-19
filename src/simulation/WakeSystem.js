import * as THREE from 'three';

/**
 * WakeSystem — surface foam and hull disturbance driven by propulsion.
 *
 * Foam quads are emitted behind the transom at a rate proportional to speed,
 * expand and fade. Turning throws more foam to the outside of the turn.
 */
export class WakeSystem {
  constructor(scene, robotGroup) {
    this.scene = scene;
    this.robot = robotGroup;
    this.max = 420;
    this.cursor = 0;

    this.positions = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.sizes = new Float32Array(this.max);
    this.seed = new Float32Array(this.max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));

    this.uniforms = {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uIntensity: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute float aLife;
        attribute float aSize;
        attribute float aSeed;
        uniform float uPixelRatio;
        varying float vLife;
        varying float vSeed;
        void main() {
          vLife = aLife;
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 320.0 * uPixelRatio / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vLife;
        varying float vSeed;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float puff = smoothstep(0.5, 0.05, r);
          float grain = 0.6 + 0.4 * sin(vSeed * 30.0);
          float a = puff * vLife * 0.55 * grain;
          gl_FragColor = vec4(vec3(0.90, 0.95, 0.96), a);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);

    this._tmp = new THREE.Vector3();
  }

  update(dt, elapsed, { speed, turn, robotPos, forward }) {
    const absSpeed = Math.abs(speed);
    this.uniforms.uIntensity.value = Math.min(1, absSpeed / 2.4);

    const rate = Math.min(1, absSpeed / 2.4);
    const emit = Math.floor(rate * 70 * dt + Math.random() * 2);
    const drift = new THREE.Vector3();

    for (let i = 0; i < emit; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;

      // Behind the transom, offset to the outside of the turn.
      const side = (Math.random() - 0.5) * (1.0 + Math.abs(turn) * 2.2);
      this._tmp.copy(robotPos)
        .addScaledVector(forward, -0.85)
        .addScaledVector(new THREE.Vector3(forward.z, 0, -forward.x).normalize(), side);

      this.positions[idx * 3] = this._tmp.x + drift.x;
      this.positions[idx * 3 + 1] = 0.03;
      this.positions[idx * 3 + 2] = this._tmp.z + drift.z;
      this.life[idx] = 1;
      this.sizes[idx] = 0.10 + Math.random() * 0.16;
      this.seed[idx] = Math.random();
    }

    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.45;
      // Foam expands and drifts backwards as it ages
      this.positions[i * 3 + 1] = 0.03;
      if (this.life[i] < 0) this.life[i] = 0;
      this.sizes[i] += dt * 0.10;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aLife.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.scene.remove(this.points);
  }
}
