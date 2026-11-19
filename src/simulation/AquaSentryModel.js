import * as THREE from 'three';
import { ROBOT } from './config';

/**
 * AquaSentryModel — 3D reconstruction of the AQUA SENTRY prototype.
 *
 * Layout follows the reference photograph:
 *   • wide black floating frame carried by two ribbed pontoons
 *   • four yellow corner flotation housings
 *   • large solar panel array across the deck
 *   • clear electronics bay with PCBs and wiring
 *   • "AQUA SENTRY" nameplate and two LED work lights on the front face
 *   • white PVC pipework: intake → pre-filter → two transparent filter
 *     canisters → pump box → discharge
 *   • antennas / GNSS domes on the rear deck
 *   • four ducted thrusters beneath the platform
 *
 * Parts that are inferred rather than visible in the photograph (rear
 * thrusters, filter internals) are flagged with INFERRED comments.
 */

// Distance along the pipe centreline at which each logical stage begins.
// The flow system uses these to colour the water and to trigger capture.
export const PIPE_STAGES = {
  intake: 0.0,
  preFilter: 0.14,
  mainFilterA: 0.42,
  mainFilterB: 0.58,
  discharge: 0.93,
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The full water path, in platform-local coordinates. Order matters: the flow
// particles travel this way, so every segment is physically connected.
export const PIPE_PATH = [
  // intake mouth -> into the platform
  V(-1.52, -0.02, 0.30), V(-1.30, -0.02, 0.30), V(-1.12, 0.02, 0.34), V(-0.94, 0.06, 0.44),
  // pre-filter: up through the media
  V(-0.70, 0.24, 0.50), V(-0.62, 0.33, 0.52), V(-0.62, 0.46, 0.52), V(-0.62, 0.58, 0.52), V(-0.62, 0.70, 0.52),
  // elbow down to the long front run
  V(-0.56, 0.66, 0.42), V(-0.34, 0.56, 0.30), V(0.00, 0.50, 0.26), V(0.34, 0.47, 0.22),
  // rise on the right side to the first filter
  V(0.46, 0.54, 0.04), V(0.50, 0.72, -0.14), V(0.52, 0.80, -0.18),
  // canister A: down-flow through the media
  V(0.52, 0.60, -0.18), V(0.52, 0.46, -0.18), V(0.52, 0.34, -0.18),
  // bottom link into canister B, then up-flow through its media
  V(0.68, 0.30, -0.18), V(0.84, 0.30, -0.18), V(0.84, 0.44, -0.18), V(0.84, 0.58, -0.18), V(0.84, 0.80, -0.18),
  // pump box
  V(1.02, 0.78, -0.18), V(1.18, 0.72, -0.18), V(1.24, 0.62, -0.18), V(1.24, 0.50, -0.17), V(1.24, 0.42, -0.14),
  // discharge back out to the right-hand port
  V(1.28, 0.28, 0.02), V(1.34, 0.14, 0.18), V(1.42, 0.02, 0.26), V(1.52, -0.02, 0.30),
];

// Centres of the transparent chambers, used by the filtration system.
export const CHAMBERS = [
  { id: 'pre', center: V(-0.62, 0.46, 0.52), radius: 0.115, height: 0.20 },
  { id: 'A', center: V(0.52, 0.46, -0.18), radius: 0.125, height: 0.22 },
  { id: 'B', center: V(0.84, 0.46, -0.18), radius: 0.125, height: 0.22 },
];

export class AquaSentryModel {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.disposables = [];
    parent.add(this.group);

    this.materials = {};
    this._buildMaterials();
    this._buildPontoons();
    this._buildDeckAndFrame();
    this._buildCornerFloats();
    this._buildSolarArray();
    this._buildElectronicsBay();
    this._buildNameplate();
    this._buildAntennas();
    this._buildFilterColumns();
    this._buildPumpBox();
    this._buildPorts();
    this._buildThrusterDucts();
  }

  // ── Materials ───────────────────────────────────────────────────────────────
  _std(color, roughness = 0.65, metalness = 0.15, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  }

  _buildMaterials() {
    const M = this.materials;
    M.frame = this._std(0x14161a, 0.55, 0.55);
    M.frameDark = this._std(0x0b0c0e, 0.7, 0.45);
    M.pontoon = this._std(0x101114, 0.82, 0.18);
    M.pontoonRib = this._std(0x1c1e22, 0.7, 0.35);
    M.yellow = this._std(0xf5c518, 0.45, 0.05);
    M.yellowDark = this._std(0xd9a410, 0.5, 0.08);
    M.alu = this._std(0xb9c0c7, 0.32, 0.85);
    M.aluDark = this._std(0x6f767d, 0.4, 0.8);
    M.steel = this._std(0x9aa3ab, 0.28, 0.9);
    M.blackPlastic = this._std(0x16181c, 0.6, 0.2);
    M.white = this._std(0xf2f4f6, 0.45, 0.05);
    M.pcb = this._std(0x14532d, 0.75, 0.1);
    M.pcbDark = this._std(0x0b2e18, 0.8, 0.1);
    M.cable = this._std(0xb3121a, 0.6, 0.1);
    M.cableYellow = this._std(0xd8b400, 0.6, 0.1);
    M.acrylic = new THREE.MeshPhysicalMaterial({
      color: 0xdff1f6,
      roughness: 0.06,
      metalness: 0,
      transmission: 0.86,
      thickness: 0.05,
      ior: 1.46,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    M.acrylicPipe = new THREE.MeshPhysicalMaterial({
      color: 0xeef6f8,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.55,
      thickness: 0.03,
      ior: 1.45,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    M.mediaBrown = this._std(0x8a5a2b, 0.92, 0.02);
    M.mediaCarbon = this._std(0x1b1b1d, 0.95, 0.05);
    M.solar = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: makeSolarTexture(), roughness: 0.16, metalness: 0.55,
    });
    M.label = new THREE.MeshBasicMaterial({ map: makeLabelTexture(), transparent: true });
    M.led = new THREE.MeshStandardMaterial({
      color: 0xfff4d0, emissive: 0xffe9a8, emissiveIntensity: 1.6, roughness: 0.3,
    });
  }

  _add(mesh, { cast = true, receive = true } = {}) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.group.add(mesh);
    return mesh;
  }

  // ── Pontoons (two ribbed floats carrying the frame) ─────────────────────────
  _buildPontoons() {
    const { pontoon, pontoonRib, blackPlastic } = this.materials;
    const len = ROBOT.depth + 0.06;

    [-1, 1].forEach((side) => {
      const x = side * 1.15;

      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.285, len - 0.57, 8, 20), pontoon);
      hull.rotation.x = Math.PI / 2;
      hull.position.set(x, -0.06, 0);
      this._add(hull);

      // Ribs
      for (let i = 0; i < 9; i++) {
        const t = (i / 8 - 0.5) * (len - 0.34);
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.288, 0.016, 6, 22), pontoonRib);
        rib.position.set(x, -0.06, t);
        this._add(rib, { cast: false });
      }

      // Deck-edge trim that ties the pontoon to the frame
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, len), blackPlastic);
      trim.position.set(x, 0.21, 0);
      this._add(trim);

      // Underwater skid
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.05, len * 0.8), this.materials.frameDark);
      skid.position.set(x, -0.31, 0);
      this._add(skid);
    });
  }

  // ── Deck plate and frame rails ─────────────────────────────────────────────
  _buildDeckAndFrame() {
    const { frame, frameDark } = this.materials;
    const W = ROBOT.width;
    const D = ROBOT.depth;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(W - 0.18, 0.07, D - 0.12), frame);
    deck.position.y = 0.26;
    this._add(deck);

    // Perimeter rails with a bolt pattern
    const railH = 0.10;
    const rails = [
      { w: W, h: railH, d: 0.10, x: 0, z: -D / 2 + 0.05 },
      { w: W, h: railH, d: 0.10, x: 0, z: D / 2 - 0.05 },
      { w: 0.10, h: railH, d: D - 0.20, x: -W / 2 + 0.05, z: 0 },
      { w: 0.10, h: railH, d: D - 0.20, x: W / 2 - 0.05, z: 0 },
    ];
    rails.forEach((r) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.h, r.d), frameDark);
      m.position.set(r.x, 0.30, r.z);
      this._add(m);
    });

    // Bolts along the rails
    const boltGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.014, 6);
    const boltMat = this.materials.steel;
    for (let i = 0; i < 14; i++) {
      const x = -W / 2 + 0.16 + (i / 13) * (W - 0.32);
      [1, -1].forEach((sz) => {
        const b = new THREE.Mesh(boltGeo, boltMat);
        b.position.set(x, 0.36, sz * (D / 2 - 0.05));
        this._add(b, { cast: false });
      });
    }

    // Cross braces underneath
    [-0.45, 0.0, 0.45].forEach((z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.06, 0.08), frameDark);
      b.position.set(0, 0.20, z);
      this._add(b);
    });
  }

  // ── Yellow corner flotation housings ────────────────────────────────────────
  _buildCornerFloats() {
    const { yellow, yellowDark, blackPlastic } = this.materials;
    const x = 1.15;
    const z = ROBOT.depth / 2 - 0.02;

    [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([px, pz]) => {
      const g = new THREE.Group();
      g.position.set(px, 0.10, pz);

      const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.26, 6, 16), yellow);
      shell.rotation.x = Math.PI / 2;
      shell.scale.set(1.25, 1, 0.9);
      shell.castShadow = true;
      shell.receiveShadow = true;
      g.add(shell);

      const band = new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.022, 6, 20), yellowDark);
      band.rotation.y = Math.PI / 2;
      band.scale.set(0.9, 1, 1);
      g.add(band);

      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.34), blackPlastic);
      mount.position.y = 0.18;
      mount.castShadow = true;
      g.add(mount);

      this.group.add(g);
    });
  }

  // ── Solar panel array ───────────────────────────────────────────────────────
  _buildSolarArray() {
    const { solar, alu } = this.materials;

    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.022, 1.06), solar);
    panel.position.set(-0.16, 0.335, -0.12);
    this._add(panel);

    const frameGeo = new THREE.BoxGeometry(2.22, 0.03, 1.12);
    const top = new THREE.Mesh(frameGeo, alu);
    top.position.set(-0.16, 0.328, -0.12);
    top.scale.y = 0.4;
    this._add(top);

    // Cell dividers as thin raised strips (visible in the reference)
    const stripMat = this.materials.aluDark;
    for (let c = 1; c < 6; c++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 1.04), stripMat);
      s.position.set(-0.16 - 1.08 + (c / 6) * 2.16, 0.349, -0.12);
      this._add(s, { cast: false });
    }
    for (let r = 1; r < 4; r++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.006, 0.006), stripMat);
      s.position.set(-0.16, 0.349, -0.12 - 0.53 + (r / 4) * 1.06);
      this._add(s, { cast: false });
    }

    // Mounting feet
    [[-1.0, -0.5], [-1.0, 0.5], [0.75, -0.5], [0.75, 0.5]].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.06, 8), this.materials.aluDark);
      foot.position.set(fx, 0.30, fz);
      this._add(foot, { cast: false });
    });
  }

  // ── Clear electronics bay with PCBs and wiring ──────────────────────────────
  _buildElectronicsBay() {
    const { acrylic, pcb, pcbDark, cable, cableYellow } = this.materials;

    const bay = new THREE.Group();
    bay.position.set(-0.22, 0.40, 0.52);
    this.group.add(bay);

    // Transparent cover
    const cover = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.17, 0.30), acrylic);
    cover.renderOrder = 4;
    bay.add(cover);

    // Two controller boards
    [-0.46, 0.10].forEach((bx, idx) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.012, 0.22), idx === 0 ? pcb : pcbDark);
      board.position.set(bx, -0.05, 0);
      bay.add(board);

      // Components
      for (let i = 0; i < 7; i++) {
        const c = new THREE.Mesh(
          new THREE.BoxGeometry(0.03 + Math.random() * 0.03, 0.022, 0.03 + Math.random() * 0.02),
          this.materials.frameDark,
        );
        c.position.set(bx - 0.2 + Math.random() * 0.4, -0.032, -0.08 + Math.random() * 0.16);
        bay.add(c);
      }
      // Electrolytic cans
      for (let i = 0; i < 3; i++) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 10), this.materials.aluDark);
        cap.position.set(bx - 0.15 + i * 0.05, -0.018, 0.07);
        bay.add(cap);
      }
    });

    // Loomed wiring
    const loom = new THREE.CatmullRomCurve3([
      V(-0.85, -0.05, -0.06), V(-0.5, 0.02, -0.09), V(-0.1, -0.02, -0.07), V(0.35, 0.03, -0.08), V(0.8, -0.04, -0.05),
    ]);
    const loomMesh = new THREE.Mesh(new THREE.TubeGeometry(loom, 32, 0.012, 6, false), cable);
    loomMesh.renderOrder = 3;
    bay.add(loomMesh);

    const loom2 = new THREE.CatmullRomCurve3([
      V(-0.7, -0.06, 0.06), V(-0.2, -0.02, 0.09), V(0.4, -0.05, 0.07),
    ]);
    bay.add(new THREE.Mesh(new THREE.TubeGeometry(loom2, 24, 0.009, 6, false), cableYellow));
  }

  // ── Nameplate and LED work lights ───────────────────────────────────────────
  _buildNameplate() {
    const { frameDark, led, steel } = this.materials;
    const z = ROBOT.depth / 2 - 0.02;

    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 0.035), frameDark);
    plate.position.set(0, 0.14, z);
    this._add(plate);

    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.16), this.materials.label);
    label.position.set(0, 0.145, z + 0.019);
    this.group.add(label);

    [-0.88, 0.88].forEach((x) => {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.05, 16), steel);
      housing.rotation.x = Math.PI / 2;
      housing.position.set(x, 0.14, z + 0.01);
      this._add(housing);

      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.044, 18), led);
      lens.position.set(x, 0.14, z + 0.037);
      this.group.add(lens);
    });
  }

  // ── Antennas and GNSS receivers ─────────────────────────────────────────────
  _buildAntennas() {
    const { aluDark, steel, white, frameDark } = this.materials;
    const z = -0.60;

    // Whip antenna
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.42, 8), frameDark);
    whip.position.set(-0.78, 0.52, z);
    this._add(whip);
    const whipBase = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.05, 12), steel);
    whipBase.position.set(-0.78, 0.30, z);
    this._add(whipBase);

    // Survey-grade GNSS dome on a mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.24, 12), steel);
    mast.position.set(-0.06, 0.41, z);
    this._add(mast);
    const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.035, 24), frameDark);
    domeBase.position.set(-0.06, 0.545, z);
    this._add(domeBase);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.082, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.position.set(-0.06, 0.56, z);
    this._add(dome);

    // Survey puck antenna
    const puckMast = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.08, 10), aluDark);
    puckMast.position.set(0.32, 0.33, z);
    this._add(puckMast);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.035, 24), aluDark);
    puck.position.set(0.32, 0.385, z);
    this._add(puck);
    const puckTop = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 20), white);
    puckTop.position.set(0.32, 0.408, z);
    this._add(puckTop);

    // Slim GNSS rod
    const rodBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.05, 14), frameDark);
    rodBase.position.set(0.58, 0.32, z);
    this._add(rodBase);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.024, 0.16, 14), white);
    rod.position.set(0.58, 0.42, z);
    this._add(rod);
  }

  // ── Transparent filter columns ──────────────────────────────────────────────
  _buildFilterColumns() {
    const { acrylic, mediaBrown, mediaCarbon, frameDark, steel } = this.materials;

    const specs = [
      { c: CHAMBERS[1], media: mediaBrown, rings: true },
      { c: CHAMBERS[2], media: mediaCarbon, rings: false },
    ];

    this.chamberGroups = {};

    specs.forEach(({ c, media, rings }) => {
      const g = new THREE.Group();
      g.position.copy(c.center);
      this.group.add(g);

      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(c.radius, c.radius, c.height, 28, 1, true),
        acrylic,
      );
      shell.renderOrder = 4;
      g.add(shell);

      // End caps
      [c.height / 2, -c.height / 2].forEach((y, i) => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(c.radius + 0.012, c.radius + 0.012, 0.045, 26), frameDark);
        cap.position.y = y;
        cap.castShadow = true;
        g.add(cap);
        // bolts around the lid
        for (let b = 0; b < 6; b++) {
          const a = (b / 6) * Math.PI * 2;
          const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 6), steel);
          bolt.position.set(Math.cos(a) * (c.radius - 0.018), y + (i === 0 ? 0.026 : -0.026), Math.sin(a) * (c.radius - 0.018));
          g.add(bolt);
        }
      });

      // Stainless clamp bands
      [c.height * 0.3, -c.height * 0.3].forEach((y) => {
        const band = new THREE.Mesh(new THREE.TorusGeometry(c.radius + 0.006, 0.007, 6, 26), steel);
        band.rotation.x = Math.PI / 2;
        band.position.y = y;
        g.add(band);
      });

      // Filter media filling the column
      if (rings) {
        // Ceramic ring media as an instanced lattice
        const geo = new THREE.TorusGeometry(0.026, 0.010, 6, 12);
        const count = 96;
        const inst = new THREE.InstancedMesh(geo, media, count);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const perRing = 12;
        for (let i = 0; i < count; i++) {
          const layer = Math.floor(i / perRing);
          const j = i % perRing;
          const a = (j / perRing) * Math.PI * 2 + layer * 0.5;
          const y = -c.height / 2 + 0.02 + layer * (c.height - 0.04) / 7;
          const r = c.radius * 0.48;
          q.setFromEuler(new THREE.Euler(0, a, Math.PI / 2 + (i % 3) * 0.4));
          m.compose(V(Math.cos(a) * r, y, Math.sin(a) * r), q, V(1, 1, 1));
          inst.setMatrixAt(i, m);
        }
        inst.instanceMatrix.needsUpdate = true;
        g.add(inst);
        this.chamberGroups[c.id] = { group: g, media: inst, baseCount: count, maxCount: count };
      } else {
        // Granular carbon media
        const geo = new THREE.IcosahedronGeometry(0.016, 0);
        const count = 220;
        const inst = new THREE.InstancedMesh(geo, media, count);
        const m = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * c.radius * 0.86;
          const y = -c.height / 2 + Math.random() * (c.height - 0.02);
          m.makeTranslation(Math.cos(a) * rr, y, Math.sin(a) * rr);
          inst.setMatrixAt(i, m);
        }
        inst.instanceMatrix.needsUpdate = true;
        g.add(inst);
        this.chamberGroups[c.id] = { group: g, media: inst, baseCount: count, maxCount: count };
      }
    });
  }

  // ── Pump box (transparent) ──────────────────────────────────────────────────
  _buildPumpBox() {
    const { acrylic, frameDark, steel, white } = this.materials;
    const g = new THREE.Group();
    g.position.set(1.18, 0.50, -0.18);
    this.group.add(g);

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.30), acrylic);
    box.renderOrder = 4;
    g.add(box);

    // Pump head on top
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.09, 20), frameDark);
    head.position.y = 0.20;
    g.add(head);
    const headCap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 18), frameDark);
    headCap.position.y = 0.26;
    g.add(headCap);

    // Pump body / impeller housing
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.20, 20), white);
    body.position.y = 0.0;
    g.add(body);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.02, 20), steel);
    ring.position.y = 0.06;
    g.add(ring);
    const blue = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.035, 18), this._std(0x1f6fb2, 0.4, 0.3));
    blue.position.y = -0.06;
    g.add(blue);

    this.pumpGroup = g;
  }

  // ── Intake and discharge ports ──────────────────────────────────────────────
  _buildPorts() {
    const { frameDark, steel } = this.materials;

    [-1, 1].forEach((side) => {
      const x = side * 1.46;
      const z = 0.30;
      const y = -0.02;

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.10, 20), frameDark);
      collar.rotation.z = Math.PI / 2;
      collar.position.set(x - side * 0.03, y, z);
      this._add(collar);

      const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.009, 6, 24), steel);
      clamp.rotation.y = Math.PI / 2;
      clamp.position.set(x - side * 0.03, y, z);
      this.group.add(clamp);

      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.07, 20, 1, true), frameDark);
      mouth.rotation.z = Math.PI / 2;
      mouth.position.set(x + side * 0.05, y, z);
      this.group.add(mouth);

      // Intake strainer cage
      if (side < 0) {
        for (let i = 0; i < 8; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.006, 0.006), steel);
          const a = (i / 8) * Math.PI * 2;
          bar.position.set(x - 0.06, y + Math.cos(a) * 0.07, z + Math.sin(a) * 0.07);
          bar.rotation.x = -a;
          this.group.add(bar);
        }
        const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.007, 6, 20), steel);
        capRing.rotation.y = Math.PI / 2;
        capRing.position.set(x - 0.11, y, z);
        this.group.add(capRing);
      }
    });
  }

  // ── Thruster ducts (INFERRED underside detail) ──────────────────────────────
  _buildThrusterDucts() {
    const { frameDark, steel } = this.materials;
    this.thrusterDucts = [];

    // Own material for the open-ended duct shell (both faces must show).
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x16181c, roughness: 0.62, metalness: 0.25, side: THREE.DoubleSide,
    });

    ROBOT.thrusters.forEach((t) => {
      const g = new THREE.Group();
      g.position.set(t.x, t.y, t.z);
      this.group.add(g);

      const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.26, 24, 1, true), shellMat);
      duct.rotation.x = Math.PI / 2;
      duct.castShadow = true;
      g.add(duct);

      [0.13, -0.13].forEach((z) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.137, 0.012, 6, 26), steel);
        ring.position.z = z;
        ring.castShadow = true;
        g.add(ring);
      });
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.136, 0.007, 5, 26), frameDark);
        rib.position.z = -0.06 + i * 0.06;
        g.add(rib);
      }

      // Mount strut up to the deck
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.07), frameDark);
      strut.position.y = 0.23;
      strut.castShadow = true;
      g.add(strut);

      this.thrusterDucts.push(g);
    });
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    Object.values(this.materials).forEach((m) => m.dispose && m.dispose());
    if (this.parent) this.parent.remove(this.group);
  }
}

// ── Canvas textures ──────────────────────────────────────────────────────────

function makeSolarTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a1424';
  ctx.fillRect(0, 0, c.width, c.height);

  const cols = 10;
  const rows = 6;
  const cw = c.width / cols;
  const ch = c.height / rows;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const g = ctx.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      g.addColorStop(0, '#122a4d');
      g.addColorStop(0.5, '#0b1c33');
      g.addColorStop(1, '#16375f');
      ctx.fillStyle = g;
      ctx.fillRect(i * cw + 2, j * ch + 2, cw - 4, ch - 4);
      // busbars
      ctx.strokeStyle = 'rgba(190,205,220,0.55)';
      ctx.lineWidth = 1;
      for (let b = 1; b <= 2; b++) {
        ctx.beginPath();
        ctx.moveTo(i * cw + (cw / 3) * b, j * ch + 3);
        ctx.lineTo(i * cw + (cw / 3) * b, (j + 1) * ch - 3);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = '#b9c0c7';
  ctx.lineWidth = 3;
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, c.height); ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(c.width, j * ch); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeLabelTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 74px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '10px';
  ctx.fillText('AQUA SENTRY', c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
