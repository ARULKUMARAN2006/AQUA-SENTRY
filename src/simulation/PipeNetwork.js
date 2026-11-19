import * as THREE from 'three';
import { PIPE_PATH, CHAMBERS } from './AquaSentryModel';

/**
 * PipeNetwork — builds one continuous tube along the prototype's pipe
 * centreline, plus the fittings, clamps and supports that hold it.
 *
 * The centreline is a single centripetal Catmull-Rom curve so the geometry can
 * never contain a floating or disconnected segment: water entering at the
 * intake always reaches the discharge.
 */
export class PipeNetwork {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    parent.add(this.group);

    this.radius = 0.052;

    this.curve = new THREE.CatmullRomCurve3(PIPE_PATH, false, 'centripetal', 0.5);
    this.length = this.curve.getLength();

    // Sampled polyline used by the flow particles (cheap, CPU friendly).
    this.samples = this.curve.getSpacedPoints(600);

    this._buildTube();
    this._buildWaterCore();
    this._buildFittings();
    this._buildSupports();

    // Normalised arc positions of the logical stages, derived from where each
    // chamber actually sits on the sampled centreline (not hard-coded, so the
    // flow colouring and capture window always line up with the geometry).
    this.stageT = {
      intake: 0,
      preFilter: this._nearestT(CHAMBERS[0].center),
      mainFilterA: this._nearestT(CHAMBERS[1].center),
      mainFilterB: this._nearestT(CHAMBERS[2].center),
      discharge: 1,
    };
  }

  /** Arc position (0..1) of the sample closest to a local-space point. */
  _nearestT(point) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const d = this.samples[i].distanceToSquared(point);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best / (this.samples.length - 1);
  }

  _buildTube() {
    const geo = new THREE.TubeGeometry(this.curve, 320, this.radius, 16, false);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf3f7f8,
      roughness: 0.16,
      metalness: 0.0,
      transmission: 0.62,
      thickness: 0.03,
      ior: 1.45,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.1,
    });
    this.tube = new THREE.Mesh(geo, mat);
    this.tube.renderOrder = 6;
    this.tube.castShadow = false;
    this.group.add(this.tube);

    // Opaque inner liner so the pipe still reads as solid PVC from outside.
    const linerGeo = new THREE.TubeGeometry(this.curve, 320, this.radius * 0.94, 16, false);
    const linerMat = new THREE.MeshStandardMaterial({
      color: 0xdfe7ea, roughness: 0.5, metalness: 0.05, side: THREE.BackSide, transparent: true, opacity: 0.55,
    });
    this.liner = new THREE.Mesh(linerGeo, linerMat);
    this.liner.renderOrder = 5;
    this.group.add(this.liner);
  }

  /** Translucent inner water column with flowing bands. */
  _buildWaterCore() {
    const geo = new THREE.TubeGeometry(this.curve, 320, this.radius * 0.8, 12, false);
    this.coreUniforms = {
      uTime: { value: 0 },
      uFlow: { value: 1 },
      uFilterT: { value: 0.42 },
      uAlgae: { value: 0.5 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.coreUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying float vT;
        void main() {
          vUv = uv;
          vT = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uFlow;
        uniform float uFilterT;
        uniform float uAlgae;
        varying vec2 vUv;
        varying float vT;

        void main() {
          // Directional banding makes the flow direction readable.
          float band = fract(vUv.x * 90.0 - uTime * 1.6 * uFlow);
          float stripe = smoothstep(0.55, 0.95, band) * 0.35;

          // Green algae-laden water before the filters, cleaner after.
          float filt = smoothstep(uFilterT - 0.06, uFilterT + 0.10, vT);
          vec3 dirty = mix(vec3(0.20, 0.46, 0.20), vec3(0.32, 0.62, 0.24), uAlgae);
          vec3 clean = vec3(0.58, 0.86, 0.94);
          vec3 col = mix(dirty, clean, filt);

          float a = (0.30 + stripe * uFlow) * uFlow;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.core = new THREE.Mesh(geo, mat);
    this.core.renderOrder = 7;
    this.group.add(this.core);
  }

  _buildFittings() {
    const fittingMat = new THREE.MeshStandardMaterial({ color: 0xe6ebee, roughness: 0.35, metalness: 0.1 });

    // Collar rings at every waypoint so elbows look like real PVC fittings.
    PIPE_PATH.forEach((p, i) => {
      if (i === 0 || i === PIPE_PATH.length - 1) return;
      const next = PIPE_PATH[Math.min(i + 1, PIPE_PATH.length - 1)];
      const dir = new THREE.Vector3().subVectors(next, p).normalize();
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(this.radius * 1.24, this.radius * 1.24, 0.028, 16),
        fittingMat,
      );
      ring.position.copy(p);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      ring.castShadow = true;
      this.group.add(ring);
    });

    // Unions where the pipe enters / leaves each transparent chamber.
    CHAMBERS.forEach((c) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(c.radius + 0.012, 0.010, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.3, metalness: 0.9 }),
      );
      ring.position.copy(c.center);
      ring.rotation.x = Math.PI / 2;
      ring.position.y += c.height / 2 + 0.005;
      this.group.add(ring);
    });
  }

  _buildSupports() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6f767d, roughness: 0.4, metalness: 0.8 });
    // Short struts holding the front pipe run off the deck.
    [[-0.30, 0.26, 0.34], [0.10, 0.26, 0.36], [0.44, 0.18, 0.38]].forEach(([x, z, y]) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.12, 0.022), mat);
      strut.position.set(x, y, z);
      strut.castShadow = true;
      this.group.add(strut);
    });
  }

  /** World-space point at normalised arc length t. */
  pointAt(t, out = new THREE.Vector3()) {
    const n = this.samples.length - 1;
    const f = Math.min(Math.max(t, 0), 1) * n;
    const i = Math.floor(f);
    const j = Math.min(i + 1, n);
    const k = f - i;
    return out.copy(this.samples[i]).lerp(this.samples[j], k);
  }

  update(elapsed, flow, algae) {
    this.coreUniforms.uTime.value = elapsed;
    this.coreUniforms.uFlow.value = flow;
    this.coreUniforms.uAlgae.value = algae;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.parent.remove(this.group);
  }
}
