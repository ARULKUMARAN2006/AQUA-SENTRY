import * as THREE from 'three';

/**
 * UnderwaterEnvironment — everything that exists ONLY while the camera is
 * looking at the pond from below the surface.
 *
 * Contents
 *   • AlgaeField    – drifting motes plus larger cluster blobs at several depths
 *   • UltrasonicUnit – treatment module slung under the hull, with expanding
 *                     concentric wavefronts
 *   • Algae reduction – clusters inside the wavefront fade out smoothly over
 *                     time while treatment runs; algae outside the field is
 *                     never touched
 *
 * All of it is a *visual* simulation of an algal bloom being treated. It is
 * not evidence that ultrasonic treatment works in the field.
 */
export class UnderwaterEnvironment {
  constructor(scene, robotPivot) {
    this.scene = scene;
    this.robot = robotPivot;

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.time = 0;
    this.treatmentOn = false;
    this.progress = 0;          // 0..1 treatment progress
    // Surviving algae fraction (0 = cleared, 1 = full bloom) mirrored from the
    // dashboard's simulated concentration. This is the single source of truth
    // for how dense the algae field looks.
    this.algaeSurviving = 1;
    this._survivingEased = 1;
    this.reduction = new Map();  // cluster id -> 0..1 removed (visual cache)
    this._tmp = new THREE.Vector3();

    // Algae collection + waste basket (a separate physical capture stage).
    // `basketFill` is 0..1, mirrored from the shared dashboard state.
    this.collectionActive = false;
    this.basketFill = 0;
    this._basketFillEased = 0;
    this._collectionSpawnAcc = 0;
    this._basketMouthWorld = new THREE.Vector3();

    this._buildAlgae();
    this._buildUltrasonicUnit();
    this._buildCollection();
  }

  // ── Algae at multiple depths ────────────────────────────────────────────────

  _buildAlgae() {
    this.clusters = [];
    const clusterGroup = new THREE.Group();
    this.group.add(clusterGroup);

    const geometry = new THREE.IcosahedronGeometry(1, 1);

    // Three depth bands so the field reads as layered, not a single slab.
    // Radii deliberately extend well past the 5.5 m treatment wavefront so a
    // ring of algae stays outside the treated area and is never cleared.
    const bands = [
      { depth: -0.9, count: 8, inner: 1.6, outer: 9.5, size: [0.55, 1.15], colour: 0x4f9c2a },
      { depth: -2.2, count: 9, inner: 2.2, outer: 10.5, size: [0.45, 0.95], colour: 0x3d8520 },
      { depth: -3.6, count: 7, inner: 3.0, outer: 9.0, size: [0.40, 0.85], colour: 0x2f6b1c },
    ];

    bands.forEach((band, bi) => {
      for (let i = 0; i < band.count; i++) {
        const a = (i / band.count) * Math.PI * 2 + bi * 0.7;
        // Alternate inside / outside the treated radius for a clear contrast.
        const outside = i % 3 === 2;
        const rMin = outside ? 6.2 : band.inner;
        const rMax = outside ? band.outer : Math.min(band.outer, 5.0);
        const r = rMin + Math.random() * Math.max(0.2, rMax - rMin);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = band.depth + (Math.random() - 0.5) * 0.6;
        const scale = band.size[0] + Math.random() * (band.size[1] - band.size[0]);

        const mat = new THREE.MeshStandardMaterial({
          color: band.colour,
          roughness: 0.85,
          metalness: 0,
          transparent: true,
          opacity: 0.82,
          flatShading: true,
          emissive: new THREE.Color(band.colour).multiplyScalar(0.18),
        });

        const blob = new THREE.Mesh(geometry, mat);
        blob.position.set(x, y, z);
        blob.scale.setScalar(scale);
        blob.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        blob.userData.driftPhase = Math.random() * Math.PI * 2;
        blob.userData.baseY = y;
        clusterGroup.add(blob);

        this.clusters.push({
          mesh: blob,
          band: bi,
          pos: new THREE.Vector3(x, y, z),
          scale,
          // Normalised distance from the emitter (0 = under the hull, 1 = far
          // edge). Clusters nearer the unit clear first as the bloom thins, so
          // the visual still reads as a wavefront sweeping outward.
          threshold: Math.min(1, Math.hypot(x, z) / 11),
        });
      }
    });

    // Suspended fine motes through the whole column.
    const count = 1800;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 9;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -0.3 - Math.random() * 4.2;
      pos[i * 3 + 2] = Math.sin(a) * r;
      size[i] = 0.02 + Math.random() * 0.045;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    moteGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    this.moteUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color(0x64b53a) },
    };
    const moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.moteUniforms,
      vertexShader: /* glsl */`
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.4 + p.z * 0.6) * 0.25;
          p.y += sin(uTime * 0.3 + p.x * 0.5) * 0.15;
          p.z += cos(uTime * 0.35 + p.x * 0.55) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * 300.0 * uPixelRatio / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.05, r) * 0.5);
        }
      `,
    });
    this.motes = new THREE.Points(moteGeo, moteMat);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
  }

  // ── Ultrasonic treatment module + wavefronts ────────────────────────────────

  _buildUltrasonicUnit() {
    this.unit = new THREE.Group();
    this.unit.position.set(0, -0.62, 0.05);
    this.robot.add(this.unit);

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.3, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.55, metalness: 0.4 });

    // Housing
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.16, 20), dark);
    body.castShadow = true;
    this.unit.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.07, 20), steel);
    cap.position.y = 0.11;
    this.unit.add(cap);

    // Mounting struts up to the hull
    [-0.12, 0.12].forEach((x) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.45, 8), steel);
      strut.position.set(x, 0.30, 0);
      this.unit.add(strut);
    });

    // Status lamp — brightens while treatment runs
    this.lampMat = new THREE.MeshStandardMaterial({
      color: 0x334048, emissive: 0x38bdf8, emissiveIntensity: 0.15, roughness: 0.3,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), this.lampMat);
    lamp.position.set(0, 0.14, 0.14);
    this.unit.add(lamp);

    // Three transducer faces underneath
    this.transducerMat = new THREE.MeshStandardMaterial({
      color: 0x6f767d, roughness: 0.35, metalness: 0.8,
      emissive: 0x22d3ee, emissiveIntensity: 0,
    });
    [-1, 0, 1].forEach((i) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 16), this.transducerMat);
      t.position.set(i * 0.085, -0.10, 0);
      this.unit.add(t);
    });

    // Concentric expanding wavefronts (horizontal rings under the unit)
    this.waves = [];
    const ringGeo = new THREE.RingGeometry(0.92, 1.0, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.y = -0.14;
      ring.renderOrder = 4;
      this.unit.add(ring);
      this.waves.push({ mesh: ring, phase: i / 3, radius: 0 });
    }

    this.treated = 0; // metres travelled by the wavefront
  }

  // ── Algae collection + waste basket ────────────────────────────────────────
  //
  // A separate physical capture stage mounted under the port hull. The basket
  // fill is driven by the shared dashboard collection state, and the moving
  // green particles represent separated algae being gathered into it. This is
  // a visualisation, not evidence of real biomass removal.
  _buildCollection() {
    this.collectionGroup = new THREE.Group();
    this.collectionGroup.position.set(-1.05, -0.55, 0.30);
    this.robot.add(this.collectionGroup);

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.3, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.55, metalness: 0.4 });
    const cageMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.5,
      metalness: 0.7,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const algaeMat = new THREE.MeshStandardMaterial({
      color: 0x3f7a24,
      roughness: 0.75,
      emissive: 0x143a08,
      emissiveIntensity: 0.45,
    });

    // Mounting arm up to the hull.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), steel);
    arm.position.y = 0.44;
    this.collectionGroup.add(arm);

    // Open cage: wall, bottom disc and ribs.
    const cage = new THREE.Group();
    this.collectionGroup.add(cage);

    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.30, 0.62, 18, 1, true), cageMat);
    wall.position.y = -0.31;
    cage.add(wall);

    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.035, 18), steel);
    bottom.position.y = -0.62;
    cage.add(bottom);

    const ringGeo = new THREE.TorusGeometry(0.35, 0.012, 6, 24);
    ringGeo.rotateX(Math.PI / 2);
    [0, -0.2, -0.4, -0.6].forEach((y, i) => {
      const ring = new THREE.Mesh(ringGeo, steel);
      ring.position.y = y;
      ring.scale.setScalar(1 - i * 0.035);
      cage.add(ring);
    });

    // Rim + intake funnel.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.022, 8, 28), steel);
    rim.rotation.x = Math.PI / 2;
    cage.add(rim);

    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.30, 0.24, 18, 1, true), dark);
    funnel.position.y = 0.12;
    cage.add(funnel);

    // Rotating collection impeller above the basket.
    this.impeller = new THREE.Group();
    this.impeller.position.y = 0.16;
    this.collectionGroup.add(this.impeller);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 10), steel);
    this.impeller.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.015, 0.08), steel);
      blade.position.set(Math.cos((i * Math.PI) / 2) * 0.16, 0, Math.sin((i * Math.PI) / 2) * 0.16);
      blade.rotation.y = -(i * Math.PI) / 2;
      this.impeller.add(blade);
    }

    // Green fill inside the cage. The geometry is translated so its origin is
    // at the bottom; scaling Y makes the basket fill progressively.
    const fillGeo = new THREE.CylinderGeometry(0.31, 0.27, 0.58, 18);
    fillGeo.translate(0, 0.29, 0);
    this.basketFillMesh = new THREE.Mesh(fillGeo, algaeMat);
    this.basketFillMesh.position.y = -0.60;
    this.basketFillMesh.scale.y = 0.001;
    cage.add(this.basketFillMesh);

    // Status lamp on the rim: green while collecting, red when full.
    this.basketLampMat = new THREE.MeshStandardMaterial({
      color: 0x334048,
      emissive: 0x22c55e,
      emissiveIntensity: 0.15,
      roughness: 0.3,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), this.basketLampMat);
    lamp.position.set(0.34, 0.03, 0.18);
    cage.add(lamp);

    // World-space anchor at the basket mouth (particles fly into this point).
    this.basketMouth = new THREE.Object3D();
    this.basketMouth.position.set(0, 0.08, 0);
    this.collectionGroup.add(this.basketMouth);

    this._buildCollectionParticles();
  }

  _buildCollectionParticles() {
    const count = 90;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      sizes[i] = 0.045 + Math.random() * 0.05;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(0x84cc16) },
      },
      vertexShader: /* glsl */`
        attribute float aSize;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 300.0 / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.05, r) * 0.85);
        }
      `,
    });

    this.collectionParticles = new THREE.Points(geo, mat);
    this.collectionParticles.frustumCulled = false;
    this.group.add(this.collectionParticles);

    this._particles = Array.from({ length: count }, () => ({
      active: false,
      t: 0,
      speed: 0.7 + Math.random() * 0.7,
      swirl: Math.random() * Math.PI * 2,
      start: new THREE.Vector3(),
    }));
  }

  _spawnCollectionParticle() {
    const p = this._particles.find((q) => !q.active);
    if (!p) return;

    const visible = this.clusters.filter((c) => c.mesh.visible);
    if (visible.length) {
      const src = visible[Math.floor(Math.random() * visible.length)];
      p.start.copy(src.mesh.position);
    } else {
      p.start.set(
        (Math.random() - 0.5) * 4,
        -1 - Math.random() * 2.5,
        (Math.random() - 0.5) * 4,
      );
    }
    p.start.x += (Math.random() - 0.5) * 0.5;
    p.start.y += (Math.random() - 0.5) * 0.4;
    p.start.z += (Math.random() - 0.5) * 0.5;
    p.active = true;
    p.t = 0;
    p.speed = 0.7 + Math.random() * 0.7;
    p.swirl = Math.random() * Math.PI * 2;
  }

  _updateCollection(dt, elapsed) {
    // Ease the visual fill toward the shared basket percentage.
    this._basketFillEased += (this.basketFill - this._basketFillEased) * Math.min(1, dt * 4);
    if (Math.abs(this.basketFill - this._basketFillEased) < 0.002) {
      this._basketFillEased = this.basketFill;
    }
    this.basketFillMesh.scale.y = Math.max(0.001, this._basketFillEased);

    // Impeller spins while collecting; idles slowly otherwise.
    this.impeller.rotation.y += dt * (this.collectionActive ? 9 : 1.2);

    // Lamp: green while collecting, red when the basket is full, dim idle.
    const full = this.basketFill >= 0.999;
    if (full) {
      this.basketLampMat.emissive.setHex(0xef4444);
      this.basketLampMat.emissiveIntensity = 1.6;
    } else if (this.collectionActive) {
      this.basketLampMat.emissive.setHex(0x22c55e);
      this.basketLampMat.emissiveIntensity = 1.2 + 0.5 * Math.sin(elapsed * 6);
    } else {
      this.basketLampMat.emissive.setHex(0x22c55e);
      this.basketLampMat.emissiveIntensity = 0.15;
    }

    // Spawn particles only while collection is actually running.
    const active = this.collectionActive && this.basketFill < 0.999;
    if (active) {
      this._collectionSpawnAcc += dt * (16 + 20 * (1 - this.basketFill));
      while (this._collectionSpawnAcc >= 1) {
        this._collectionSpawnAcc -= 1;
        this._spawnCollectionParticle();
      }
    } else {
      this._collectionSpawnAcc = 0;
    }

    // Move each particle from an algae cluster toward the basket mouth.
    this.basketMouth.getWorldPosition(this._basketMouthWorld);
    const mouth = this._basketMouthWorld;
    const posAttr = this.collectionParticles.geometry.getAttribute('position');
    this._particles.forEach((p, i) => {
      if (!p.active) return;
      p.t += dt * p.speed;
      if (p.t >= 1) {
        p.active = false;
        posAttr.setXYZ(i, 0, -100, 0);
        return;
      }
      const ease = p.t * p.t * (3 - 2 * p.t);
      const swirl = Math.sin(p.t * Math.PI * 2 + p.swirl) * (1 - p.t) * 0.55;
      const x = p.start.x + (mouth.x - p.start.x) * ease + Math.cos(p.swirl) * swirl;
      const y = p.start.y + (mouth.y - p.start.y) * ease + Math.sin(p.t * Math.PI) * 0.25;
      const z = p.start.z + (mouth.z - p.start.z) * ease + Math.sin(p.swirl) * swirl;
      posAttr.setXYZ(i, x, y, z);
    });
    posAttr.needsUpdate = true;
  }

  // ── Public control ──────────────────────────────────────────────────────────

  setTreatment(on) {
    this.treatmentOn = !!on;
    // Progress is preserved by the caller (dashboard) so treatment can resume
    // from where it left off. Waves stop because treatmentOn is false.
  }

  /**
   * Drive the visuals from the shared treatment progress (0..100) so the 3D
   * scene and the dashboard can never disagree.
   */
  setProgress(pct) {
    this.progress = Math.max(0, Math.min(100, pct || 0));
  }

  /**
   * Mirror the simulated algae concentration. `fraction` is the surviving share
   * of the bloom (0 = fully cleared, 1 = untreated). The 3D field's density is
   * derived from this, so what you see always matches the dashboard number.
   */
  setAlgaeSurviving(fraction) {
    this.algaeSurviving = Math.max(0, Math.min(1, fraction == null ? 1 : fraction));
  }

  /**
   * Drive the collection visuals from the shared dashboard state.
   * @param {{fill?: number, active?: boolean}} state fill is 0..1
   */
  setAlgaeCollection(state) {
    if (!state) return;
    if (state.fill != null) this.basketFill = Math.max(0, Math.min(1, state.fill));
    if (state.active != null) this.collectionActive = !!state.active;
  }

  /** Empty the basket and stop the collection particles. */
  resetCollection() {
    this.basketFill = 0;
    this._basketFillEased = 0;
    this.collectionActive = false;
    this._collectionSpawnAcc = 0;
    this._particles?.forEach((p) => { p.active = false; });
    const posAttr = this.collectionParticles?.geometry?.getAttribute('position');
    if (posAttr) {
      for (let i = 0; i < posAttr.count; i++) posAttr.setXYZ(i, 0, -100, 0);
      posAttr.needsUpdate = true;
    }
  }

  /** Clear treatment state (pause/reset): waves stop, the bloom returns. */
  reset() {
    this.treatmentOn = false;
    this.progress = 0;
    this.treated = 0;
    this.reduction.clear();
    this.algaeSurviving = 1;
    this._survivingEased = 1;
    this.resetCollection();
  }

  getStatus() {
    return {
      treatment: this.treatmentOn ? 'ACTIVE' : 'INACTIVE',
      progress: Math.round(this.progress),
      algae: this._algaLevel(),
      collection: this.collectionActive ? 'ACTIVE' : 'IDLE',
      basketFill: Math.round(this._basketFillEased * 100),
    };
  }

  _algaLevel() {
    // The dashboard concentration is the source of truth, so the level shown in
    // the 3D panel always agrees with it.
    const level = this._survivingEased;
    if (level > 0.66) return 'HIGH';
    if (level > 0.33) return 'MEDIUM';
    return 'LOW';
  }

  // ── Frame update ────────────────────────────────────────────────────────────

  update(dt, elapsed) {
    this.group.visible = true;
    this.time = elapsed;
    this.moteUniforms.uTime.value = elapsed;

    // Fine motes thin out as the bloom is cleared.
    this._survivingEased += (this.algaeSurviving - this._survivingEased) * Math.min(1, dt * 2.0);
    if (Math.abs(this.algaeSurviving - this._survivingEased) < 0.002) {
      this._survivingEased = this.algaeSurviving;
    }
    const moteTarget = 0.25 + 0.75 * this._survivingEased;
    this._moteOpacity = this._moteOpacity == null ? 1 : this._moteOpacity + (moteTarget - this._moteOpacity) * Math.min(1, dt * 0.8);
    this.motes.material.opacity = this._moteOpacity;

    // Wavefronts expand; the treated radius follows the shared progress value.
    const maxRadius = 5.5;
    const targetTreated = (this.progress / 100) * maxRadius;
    // Ease toward the shared value so the field matches the dashboard smoothly.
    this.treated += (targetTreated - this.treated) * Math.min(1, dt * 2.2);
    if (Math.abs(targetTreated - this.treated) < 0.01) this.treated = targetTreated;

    this.waves.forEach((w) => {
      if (!this.treatmentOn) {
        w.mesh.material.opacity += (0 - w.mesh.material.opacity) * Math.min(1, dt * 4);
        return;
      }
      const t = (elapsed * 0.55 + w.phase) % 1;
      const r = 0.25 + t * maxRadius;
      w.mesh.scale.setScalar(r);
      w.radius = r;
      const fade = Math.sin(t * Math.PI);
      w.mesh.material.opacity = 0.42 * fade;
    });

    // Lamp + transducers reflect the working state.
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4);
    this.lampMat.emissiveIntensity = this.treatmentOn ? 1.6 + pulse * 1.8 : 0.12;
    this.transducerMat.emissiveIntensity = this.treatmentOn ? 0.9 + pulse * 1.1 : 0.0;

    // Algae clusters: gentle drift, plus a density that tracks the simulated
    // concentration. Every blob shrinks as the bloom is cleared, and blobs
    // nearer the emitter shrink first, so the reduction is visible immediately
    // and still reads as a wavefront sweeping outward. Nothing is added or
    // removed from the scene — only each existing blob's size/opacity changes.
    const surviving = this._survivingEased;
    this.clusters.forEach((c, i) => {
      const mesh = c.mesh;
      mesh.position.y = c.pos.y + Math.sin(elapsed * 0.5 + mesh.userData.driftPhase) * 0.12;
      mesh.rotation.y += dt * 0.06;
      mesh.rotation.x += dt * 0.03;

      // Near clusters (threshold ~0) clear faster than far ones (threshold ~1),
      // while the whole field scales with the remaining concentration.
      const bias = Math.max(0.35, 1 - c.threshold * 0.3);
      const fade = Math.max(0, Math.min(1, surviving / bias));
      this.reduction.set(i, 1 - fade);

      mesh.scale.setScalar(Math.max(0.02, c.scale * fade));
      mesh.material.opacity = 0.82 * fade;
      mesh.visible = fade > 0.02;
    });

    // Collection basket fill, impeller and particle transfer.
    this._updateCollection(dt, elapsed);
  }

  hide() {
    this.group.visible = false;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.unit.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    if (this.collectionGroup) {
      this.collectionGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      if (this.collectionGroup.parent) this.collectionGroup.parent.remove(this.collectionGroup);
    }
    if (this.unit.parent) this.unit.parent.remove(this.unit);
    if (this.scene) this.scene.remove(this.group);
  }
}
