import * as THREE from 'three';

/**
 * WaterFlowSystem — algae-bearing water travelling through the pipe network.
 *
 * Particles ride the sampled centreline of PipeNetwork. Their colour encodes
 * how much algae the water still carries, so the viewer can see the water
 * leaving the filter cleaner than the water entering it.
 *
 * The particle stream stops when the simulated pump is switched off.
 */
export class WaterFlowSystem {
  constructor(parent, pipeNetwork, { count = 900 } = {}) {
    this.pipe = pipeNetwork;
    this.count = count;
    this.active = true;

    this.t = new Float32Array(count);       // position along the path 0..1
    this.speed = new Float32Array(count);   // per-particle speed jitter
    this.captured = new Uint8Array(count);  // 1 = removed by the filter media

    for (let i = 0; i < count; i++) {
      this.t[i] = i / count;
      this.speed[i] = 0.85 + Math.random() * 0.3;
    }

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) sizes[i] = 0.022 + Math.random() * 0.016;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aSize;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 260.0 * uPixelRatio / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.12, r);
          gl_FragColor = vec4(vColor, a * uOpacity);
        }
      `,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.renderOrder = 8;
    this.points.frustumCulled = false;
    parent.add(this.points);

    this.tmp = new THREE.Vector3();
    this.filterT = 0;
    this.capturedSink = [];
  }

  setActive(on) {
    this.active = on;
    this.material.uniforms.uOpacity.value = on ? 1 : 0.35;
  }

  /**
   * @param {number} dt seconds
   * @param {number} flow 0..1 simulated flow rate
   * @param {number} outletAlgae 0..1 algae concentration leaving the filter
   * @param {object} filter  FiltrationSystem (for capture callbacks)
   */
  update(dt, flow, outletAlgae, filter) {
    const { stageT } = this.pipe;
    const filterStart = stageT.mainFilterA;
    const filterEnd = stageT.mainFilterB;
    this.filterT = filterStart;

    const speed = this.active ? 0.085 * flow : 0;

    const pos = this.points.geometry.attributes.position.array;
    const col = this.points.geometry.attributes.aColor.array;

    const dirty = [0.20 + outletAlgae * 0.25, 0.55 - outletAlgae * 0.12, 0.18];
    const clean = [0.62, 0.90, 0.97];

    for (let i = 0; i < this.count; i++) {
      if (this.active && flow > 0.001) {
        this.t[i] += dt * speed * this.speed[i];
        if (this.t[i] >= 1) this.t[i] -= 1;
      }

      const t = this.t[i];
      this.pipe.pointAt(t, this.tmp);

      // Small helical offset so the stream fills the pipe bore.
      const a = i * 2.399 + t * 18.0;
      const rr = 0.016;
      this.tmp.x += Math.cos(a) * rr;
      this.tmp.y += Math.sin(a) * rr;

      pos[i * 3] = this.tmp.x;
      pos[i * 3 + 1] = this.tmp.y;
      pos[i * 3 + 2] = this.tmp.z;

      // Algae removed inside the filter columns.
      const wasCaptured = this.captured[i];
      const inFilter = t > filterStart && t < filterEnd;
      if (this.active && inFilter && !wasCaptured && filter) {
        if (filter.tryCapture(outletAlgae)) {
          this.captured[i] = 1;
          filter.registerCapture(this.tmp);
        }
      }
      if (!inFilter && wasCaptured) this.captured[i] = 0;

      const afterFilter = t > filterEnd;
      const src = afterFilter ? clean : dirty;
      const fade = wasCaptured ? 0.15 : 1.0;
      col[i * 3] = src[0] * fade;
      col[i * 3 + 1] = src[1] * fade;
      col[i * 3 + 2] = src[2] * fade;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aColor.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    if (this.points.parent) this.points.parent.remove(this.points);
  }
}
