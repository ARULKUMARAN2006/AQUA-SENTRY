import * as THREE from 'three';

/**
 * SensorSystem — the instrumented sensor suite carried by the prototype.
 *
 * Every sensor is an independently animated object mounted at its plausible
 * position on the hull:
 *
 *   do        Dissolved oxygen probe  – wicking membrane, port under the hull
 *   turbidity Optical turbidity probe  – collimated emitter + receiver pair
 *   optical   Optical underwater unit – downward beam with a detection cone
 *   ph        pH probe                 – glass bulb in a guard cage
 *   temp      Temperature probe        – stainless thermowell
 *   tds       TDS conductivity probe   – two bare electrodes in a flow cell
 *
 * Each unit shows its own live reading and an operating indicator:
 *   WORKING (green) / WARNING (amber) / FAULT (red, blinking, beam cut)
 *
 * All values are simulated demo data.
 */

export const SENSOR_SPECS = [
  {
    id: 'do',
    label: 'Dissolved Oxygen',
    short: 'DO',
    unit: 'mg/L',
    color: 0x38bdf8,
    mount: { x: -1.02, y: -0.20, z: 0.50 },
    kind: 'probe',
    note: 'Wicking membrane probe, port side',
  },
  {
    id: 'turbidity',
    label: 'Turbidity',
    short: 'TURB',
    unit: 'NTU',
    color: 0xfbbf24,
    mount: { x: 1.02, y: -0.20, z: 0.50 },
    kind: 'turbidimeter',
    note: 'Emitter/receiver pair, starboard',
  },
  {
    id: 'optical',
    label: 'Optical Underwater',
    short: 'OPT',
    unit: '%',
    color: 0xa78bfa,
    mount: { x: 0.62, y: -0.22, z: -0.62 },
    kind: 'optical',
    note: 'Downward beam, aft quarter',
  },
  {
    id: 'ph',
    label: 'pH',
    short: 'pH',
    unit: '',
    color: 0x4ade80,
    mount: { x: -0.66, y: -0.19, z: -0.55 },
    kind: 'probe',
    note: 'Glass bulb probe, aft quarter',
  },
  {
    id: 'temperature',
    label: 'Temperature',
    short: 'TEMP',
    unit: '°C',
    color: 0xfb923c,
    mount: { x: -0.20, y: -0.19, z: -0.55 },
    kind: 'probe',
    note: 'Stainless thermowell',
  },
  {
    id: 'tds',
    label: 'TDS',
    short: 'TDS',
    unit: 'ppm',
    color: 0x22d3ee,
    mount: { x: 0.30, y: -0.19, z: -0.55 },
    kind: 'probe',
    note: 'Conductivity flow cell',
  },
];

const OPERATING_COLOR = {
  NORMAL: new THREE.Color(0x22c55e),
  WARNING: new THREE.Color(0xf59e0b),
  CRITICAL: new THREE.Color(0xf97316),
  FAULT: new THREE.Color(0xef4444),
  UNKNOWN: new THREE.Color(0x94a3b8),
};

export class SensorSystem {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    parent.add(this.group);

    this.units = [];
    this.sparks = [];
    this._t = 0;
    // Floating labels are optional so the model can stay uncluttered.
    this.labelsVisible = false;

    this._materials();
    SENSOR_SPECS.forEach((spec) => this._buildUnit(spec));
    this._buildBeam();
    this._buildClarityVolume();
  }

  /** Show/hide the floating sensor labels without changing the sensors. */
  setLabelsVisible(visible) {
    this.labelsVisible = !!visible;
    this.units.forEach((u) => { u.label.visible = this.labelsVisible; });
  }

  _materials() {
    const M = this.materials = {};
    M.body = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.45, metalness: 0.75 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0xb6bdc4, roughness: 0.25, metalness: 0.9 });
    M.glass = new THREE.MeshPhysicalMaterial({
      color: 0xdfeef5, roughness: 0.08, metalness: 0, transmission: 0.9,
      thickness: 0.03, ior: 1.5, transparent: true,
    });
    M.cap = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.6, metalness: 0.3 });
  }

  _buildUnit(spec) {
    const g = new THREE.Group();
    g.position.set(spec.mount.x, spec.mount.y, spec.mount.z);
    this.group.add(g);

    const { body, steel, glass, cap } = this.materials;

    // Mounting boss up to the hull
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.10, 12), body);
    boss.position.y = 0.10;
    boss.castShadow = true;
    g.add(boss);

    // Probe body
    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.20, 14), body);
    bodyMesh.position.y = -0.02;
    bodyMesh.castShadow = true;
    g.add(bodyMesh);

    // Coloured ID band so each sensor is identifiable at a glance
    const bandMat = new THREE.MeshStandardMaterial({
      color: spec.color, emissive: spec.color, emissiveIntensity: 0.55, roughness: 0.35,
    });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.03, 14), bandMat);
    band.position.y = 0.045;
    g.add(band);

    // Sensor-specific head
    if (spec.kind === 'optical') {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 16), glass);
      lens.position.y = -0.135;
      g.add(lens);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 18), steel);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.148;
      g.add(ring);
    } else if (spec.kind === 'turbidimeter') {
      const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10), cap);
      emitter.position.set(0.04, -0.13, 0);
      g.add(emitter);
      const receiver = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10), cap);
      receiver.position.set(-0.04, -0.13, 0);
      g.add(receiver);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.026), steel);
      bridge.position.y = -0.12;
      g.add(bridge);
    } else {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 12), glass);
      bulb.position.y = -0.135;
      bulb.scale.y = 1.25;
      g.add(bulb);
      // Protective guard cage
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.10, 5), steel);
        bar.position.set(Math.cos(a) * 0.030, -0.135, Math.sin(a) * 0.030);
        g.add(bar);
      }
      const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.005, 5, 14), steel);
      capRing.rotation.x = Math.PI / 2;
      capRing.position.y = -0.182;
      g.add(capRing);
    }

    // Operating indicator LED on top of the boss
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 2.2, roughness: 0.3,
    });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), ledMat);
    led.position.y = 0.162;
    g.add(led);

    // Halo ring so the status colour is readable from a distance
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, 6, 24), haloMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.162;
    halo.renderOrder = 9;
    g.add(halo);

    // Sprite label showing the live reading (canvas texture, updated in place)
    const label = makeLabelSprite(spec);
    label.position.y = 0.30;
    label.renderOrder = 10;
    label.visible = this.labelsVisible;
    g.add(label);

    this.units.push({
      spec, group: g, led, ledMat, halo, haloMat, bandMat,
      label, labelCtx: label.material.map.image.getContext('2d'),
      lastText: '',
    });
  }

  /** Downward cone of light + detection footprint for the optical sensor. */
  _buildBeam() {
    const geo = new THREE.ConeGeometry(0.34, 2.6, 20, 1, true);
    geo.translate(0, -1.3, 0);
    this.beamUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xa78bfa) },
      uStrength: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.beamUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          // Fade along the beam and pulse slowly to read as a live scan.
          float fade = smoothstep(1.0, 0.0, vUv.y);
          float pulse = 0.65 + 0.35 * sin(uTime * 2.0 - vUv.y * 9.0);
          float edge = smoothstep(0.0, 0.25, abs(vUv.x - 0.5) * 2.0);
          gl_FragColor = vec4(uColor, fade * pulse * uStrength * 0.28 * edge);
        }
      `,
    });
    this.beam = new THREE.Mesh(geo, mat);
    const optical = this.units.find((u) => u.spec.id === 'optical');
    if (optical) {
      this.beam.position.set(0, -0.15, 0);
      optical.group.add(this.beam);
    }
  }

  /**
   * A shallow volume under the turbidity probe whose opacity tracks the reading,
   * so water clarity visibly changes with the simulated turbidity value.
   */
  _buildClarityVolume() {
    const geo = new THREE.SphereGeometry(0.5, 20, 14);
    this.clarityUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xbba46a) },
      uStrength: { value: 0.4 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.clarityUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec3 vPos;
        varying vec3 vNormalW;
        void main() {
          vPos = position;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uStrength;
        varying vec3 vPos;
        varying vec3 vNormalW;
        void main() {
          vec3 V = normalize(cameraPosition - vec3(0.0));
          float rim = 1.0 - abs(dot(normalize(vNormalW), V));
          float swirl = 0.6 + 0.4 * sin(vPos.y * 9.0 + uTime * 1.4 + vPos.x * 5.0);
          gl_FragColor = vec4(uColor, rim * uStrength * 0.5 * swirl);
        }
      `,
    });
    this.clarity = new THREE.Mesh(geo, mat);
    this.clarity.position.y = -0.42;
    this.clarity.scale.set(1, 0.8, 1);
    const turb = this.units.find((u) => u.spec.id === 'turbidity');
    if (turb) turb.group.add(this.clarity);
  }

  /**
   * @param {number} dt seconds
   * @param {number} elapsed seconds
   * @param {object} sensors { readings, operating } from the shared context
   */
  update(dt, elapsed, sensors) {
    this._t = elapsed;
    const { readings, operating } = sensors;

    this.units.forEach((u) => {
      const status = operating[u.spec.id] || 'NORMAL';
      const value = readings[u.spec.id];
      const color = OPERATING_COLOR[status] || OPERATING_COLOR.NORMAL;

      // Fault units blink hard; critical pulses orange; warning/normal gentle.
      let intensity;
      if (status === 'FAULT') intensity = 0.25 + 2.4 * (Math.sin(elapsed * 9) > 0 ? 1 : 0);
      else if (status === 'CRITICAL') intensity = 1.6 + 0.9 * (0.5 + 0.5 * Math.sin(elapsed * 4.2));
      else if (status === 'WARNING') intensity = 1.6 + 0.7 * (0.5 + 0.5 * Math.sin(elapsed * 3.0));
      else intensity = 2.0 + 0.5 * Math.sin(elapsed * 1.8 + u.spec.mount.x);

      u.ledMat.color.copy(color);
      u.ledMat.emissive.copy(color);
      u.ledMat.emissiveIntensity = intensity;
      u.haloMat.color.copy(color);
      u.haloMat.opacity = status === 'FAULT' ? 0.25 + 0.5 * (Math.sin(elapsed * 9) > 0 ? 1 : 0) : 0.45;
      u.halo.rotation.z = elapsed * (status === 'FAULT' ? 3.5 : 0.8);

      const text = this._format(u.spec, value, status);
      if (text !== u.lastText) {
        drawLabel(u.labelCtx, u.label.material.map, u.spec, text, status);
        u.lastText = text;
      }
    });

    // Optical beam follows the operating state and the transmission reading.
    const optStatus = operating.optical || 'NORMAL';
    const optValue = readings.optical;
    this.beamUniforms.uTime.value = elapsed;
    const strength = optStatus === 'FAULT'
      ? 0.12
      : THREE.MathUtils.clamp((optValue ?? 80) / 100, 0.15, 1);
    this.beamUniforms.uStrength.value =
      optStatus === 'WARNING' || optStatus === 'CRITICAL' ? strength * 0.7 : strength;

    // Clarity volume tracks turbidity: thicker and browner as NTU rises.
    this.clarityUniforms.uTime.value = elapsed;
    const ntu = readings.turbidity;
    const turbStatus = operating.turbidity || 'NORMAL';
    const load = THREE.MathUtils.clamp((ntu ?? 3) / 30, 0, 1);
    this.clarityUniforms.uStrength.value = turbStatus === 'FAULT' ? 0.05 : 0.15 + load * 0.85;
    this.clarityUniforms.uColor.value.setHSL(0.11 - load * 0.04, 0.35 + load * 0.25, 0.45 + load * 0.12);
    this.clarity.scale.setScalar(0.7 + load * 0.9);
  }

  _format(spec, value, status) {
    if (status === 'FAULT' || value == null) return 'FAULT';
    const v = spec.unit === 'mg/L'
      ? value.toFixed(1)
      : Number.isInteger(value) ? String(value) : value.toFixed(2);
    return `${spec.short} ${v}${spec.unit ? ` ${spec.unit}` : ''}`;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    if (this.parent) this.parent.remove(this.group);
  }
}

// ── Floating labels ─────────────────────────────────────────────────────────

function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.62, 0.175, 1);
  return sprite;
}

function drawLabel(ctx, tex, spec, text, status) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  // panel
  ctx.fillStyle = 'rgba(6, 16, 24, 0.82)';
  ctx.strokeStyle = status === 'NORMAL' ? '#22c55e'
    : status === 'WARNING' ? '#f59e0b'
    : status === 'CRITICAL' ? '#f97316' : '#ef4444';
  ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, w - 4, h - 4, 10);
  ctx.fill();
  ctx.stroke();

  // name
  ctx.fillStyle = '#8fd8ea';
  ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(spec.label.toUpperCase(), 12, 9);

  // DEMO DATA tag
  ctx.fillStyle = '#f3c969';
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('DEMO DATA', w - 12, 11);

  // value
  ctx.fillStyle = status === 'NORMAL' ? '#eafff2'
    : status === 'WARNING' ? '#ffe9bd'
    : status === 'CRITICAL' ? '#ffd9bd' : '#ffd4d4';
  ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(text, 12, 34);

  // status
  ctx.fillStyle = status === 'NORMAL' ? '#4ade80'
    : status === 'WARNING' ? '#fbbf24'
    : status === 'CRITICAL' ? '#fb923c' : '#f87171';
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(status, w - 12, 47);

  tex.needsUpdate = true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
