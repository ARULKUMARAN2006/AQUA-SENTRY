import * as THREE from 'three';
import { LAKE } from './config';
import { terrainHeight, shoreRadius } from './waves';

/**
 * LakeEnvironment — terrain, shoreline, vegetation, rocks, reeds and lighting.
 *
 * The terrain mesh is generated from the same analytic height function the
 * water shader uses, so the shoreline line is continuous and the shallows
 * agree with the colour under the water.
 */
export class LakeEnvironment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunDirection = new THREE.Vector3(0.42, 0.72, 0.55).normalize();

    this._buildSky();
    this._buildLighting();
    this._buildEnvironmentMap();
    this._buildTerrain();
    this._buildRocks();
    this._buildTrees();
    this._buildReeds();
    this._buildUnderwaterVolume();
  }

  // ── Sky dome ────────────────────────────────────────────────────────────────
  _buildSky() {
    const geo = new THREE.SphereGeometry(1200, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: this.sunDirection },
        uZenith: { value: new THREE.Color(0x2f6fb5) },
        uHorizon: { value: new THREE.Color(0xd7e8f4) },
        uGround: { value: new THREE.Color(0x50603f) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uGround;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 col;
          if (y >= 0.0) {
            float t = pow(clamp(y, 0.0, 1.0), 0.62);
            col = mix(uHorizon, uZenith, t);
            // Sun disc + broad glow
            float sd = max(dot(d, normalize(uSunDir)), 0.0);
            col += vec3(1.0, 0.94, 0.82) * pow(sd, 900.0) * 3.0;
            col += vec3(1.0, 0.92, 0.78) * pow(sd, 14.0) * 0.22;
          } else {
            col = mix(uHorizon, uGround, clamp(-y * 3.2, 0.0, 1.0));
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // ── Lighting ────────────────────────────────────────────────────────────────
  _buildLighting() {
    this.sun = new THREE.DirectionalLight(0xfff2d6, 3.1);
    this.sun.position.copy(this.sunDirection).multiplyScalar(120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 26;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Sky/ground bounce
    this.hemi = new THREE.HemisphereLight(0xa9d4f0, 0x2c3a24, 0.85);
    this.scene.add(this.hemi);

    // Cool fill from the opposite side so the hull never goes fully black
    this.fill = new THREE.DirectionalLight(0x9fc8e8, 0.45);
    this.fill.position.set(-80, 40, -60);
    this.scene.add(this.fill);
  }

  /** PMREM environment map generated from the sky for PBR reflections. */
  _buildEnvironmentMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const tmp = new THREE.Scene();
    const skyClone = this.sky.clone();
    tmp.add(skyClone);
    this.envRT = pmrem.fromScene(tmp, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.75;
    pmrem.dispose();
    tmp.remove(skyClone);
  }

  // ── Terrain ─────────────────────────────────────────────────────────────────
  _buildTerrain() {
    const size = LAKE.terrainSize;
    const seg = LAKE.terrainSegments;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cSand = new THREE.Color(0xa89468);
    const cWetSand = new THREE.Color(0x6f6242);
    const cGrass = new THREE.Color(0x4e7a3c);
    const cForest = new THREE.Color(0x2f5730);
    const cRock = new THREE.Color(0x77776f);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);

      if (y < -0.15) {
        tmp.copy(cWetSand).lerp(cSand, Math.min(1, (y + 4) / 4));
      } else if (y < 1.6) {
        tmp.copy(cSand).lerp(cGrass, Math.min(1, y / 1.6));
      } else {
        tmp.copy(cGrass).lerp(cForest, Math.min(1, (y - 1.6) / 4));
        // bare rock on steep ground
        const dx = terrainHeight(x + 1.5, z) - terrainHeight(x - 1.5, z);
        const dz = terrainHeight(x, z + 1.5) - terrainHeight(x, z - 1.5);
        const slope = Math.min(1, Math.hypot(dx, dz) / 2.4);
        tmp.lerp(cRock, slope * 0.55);
        // subtle noise breakup
        const n = (Math.sin(x * 0.7) * Math.sin(z * 0.63)) * 0.04;
        tmp.offsetHSL(0, 0, n);
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  // ── Rocks ───────────────────────────────────────────────────────────────────
  _buildRocks() {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    // Roughen the icosahedron so rocks are not obviously spherical
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = 0.75 + Math.random() * 0.5;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ color: 0x8b8a83, roughness: 0.92, metalness: 0.02, flatShading: true });
    const count = 90;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = true;
    inst.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const shore = shoreRadius(a);
      const d = shore - 6 + Math.random() * 22;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const s = 0.35 + Math.random() * 1.5;
      e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(x, terrainHeight(x, z) + s * 0.25, z),
        q,
        new THREE.Vector3(s, s, s),
      );
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);
    this.rocks = inst;
  }

  // ── Trees ───────────────────────────────────────────────────────────────────
  _buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.24, 1, 7);
    trunkGeo.translate(0, 0.5, 0);
    const canopyGeo = new THREE.ConeGeometry(1, 1, 8);
    canopyGeo.translate(0, 0.5, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4030, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.9, flatShading: true });

    const COUNT = 260;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
    const canopies = new THREE.InstancedMesh(canopyGeo, leafMat, COUNT * 2);
    trunks.castShadow = true;
    canopies.castShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    let placed = 0;
    let guard = 0;
    while (placed < COUNT && guard < COUNT * 30) {
      guard++;
      const a = Math.random() * Math.PI * 2;
      const shore = shoreRadius(a);
      const d = shore + 6 + Math.pow(Math.random(), 0.6) * 70;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const y = terrainHeight(x, z);
      if (y < 0.8) continue;
      if (Math.hypot(x, z) > LAKE.terrainSize * 0.45) continue;

      const h = 5 + Math.random() * 8;
      const w = 0.7 + Math.random() * 0.7;

      pos.set(x, y - 0.2, z);
      scl.set(w, h * 0.5, w);
      m.compose(pos, q, scl);
      trunks.setMatrixAt(placed, m);

      for (let c = 0; c < 2; c++) {
        const cy = y + h * (c === 0 ? 0.28 : 0.52);
        const cw = h * w * (c === 0 ? 0.34 : 0.24);
        const ch = h * (c === 0 ? 0.52 : 0.42);
        pos.set(x, cy, z);
        scl.set(cw, ch, cw);
        m.compose(pos, q, scl);
        canopies.setMatrixAt(placed * 2 + c, m);
      }
      placed++;
    }
    trunks.count = placed;
    canopies.count = placed * 2;
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks);
    this.scene.add(canopies);
  }

  // ── Reeds around the shore ──────────────────────────────────────────────────
  _buildReeds() {
    const geo = new THREE.PlaneGeometry(0.08, 1, 1, 3);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6f7f42, roughness: 0.95, side: THREE.DoubleSide,
    });
    const COUNT = 700;
    const inst = new THREE.InstancedMesh(geo, mat, COUNT);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    let guard = 0;
    while (placed < COUNT && guard < COUNT * 20) {
      guard++;
      const a = Math.random() * Math.PI * 2;
      const shore = shoreRadius(a);
      const d = shore - 5 + Math.random() * 9;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const y = terrainHeight(x, z);
      if (y > 0.9 || y < -0.8) continue;
      const h = 0.8 + Math.random() * 1.4;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, h, 1));
      inst.setMatrixAt(placed++, m);
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    this.scene.add(inst);
  }

  /** Murky volume + light shafts, only enabled when the camera is submerged. */
  _buildUnderwaterVolume() {
    this.underwaterGroup = new THREE.Group();
    this.underwaterGroup.visible = false;
    this.scene.add(this.underwaterGroup);

    // Suspended motes
    const count = 2600;
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() ** 0.5 * 55;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -Math.random() * 9;
      pos[i * 3 + 2] = Math.sin(a) * r;
      sizes[i] = 0.012 + Math.random() * 0.03;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: /* glsl */`
        attribute float aSize;
        uniform float uPixelRatio;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 220.0 * uPixelRatio / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          gl_FragColor = vec4(vec3(0.75, 0.92, 0.9), smoothstep(0.5, 0.0, r) * 0.35);
        }
      `,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.underwaterGroup.add(this.motes);

    // Light shafts
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xbfe8ff,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const geoS = new THREE.CylinderGeometry(0.7, 3.4, 14, 10, 1, true);
      const shaft = new THREE.Mesh(geoS, shaftMat);
      shaft.position.set(Math.cos(a) * 22, -6, Math.sin(a) * 22);
      shaft.rotation.z = 0.16;
      shaft.rotation.x = -0.1;
      this.underwaterGroup.add(shaft);
    }
  }

  setUnderwater(on) {
    this.underwaterGroup.visible = on;
    this.hemi.intensity = on ? 0.35 : 0.85;
    this.sun.intensity = on ? 1.5 : 3.1;
    this.sky.visible = true;
  }

  /** Keep the shadow frustum tight around the robot. */
  followShadow(target) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDirection, 90);
    this.sun.target.updateMatrixWorld();
  }

  dispose() {
    this.scene.traverse(() => {});
    if (this.envRT) this.envRT.dispose();
  }
}
