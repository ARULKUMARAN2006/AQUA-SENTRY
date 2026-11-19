import * as THREE from 'three';
import { FILTRATION } from './config';
import { CHAMBERS } from './AquaSentryModel';

/**
 * FiltrationSystem — the conceptual algae-removal model plus its visuals.
 *
 * Model (simple, explicit and internally consistent):
 *   flow            ramps to 1 when the simulated pump runs
 *   efficiency      = efficiencyMax * (1 - efficiencyLoss * saturation)
 *   outletAlgae     = lakeAlgae * (1 - efficiency)
 *   captured       += lakeAlgae * flow * efficiency * captureRate * dt
 *   saturation      = captured / mediaCapacity
 *
 * Every captured particle is rendered as a green fleck that settles inside a
 * filter chamber, and the media beds visibly load up as saturation rises.
 *
 * This is a conceptual model for visualisation only; it is not experimental
 * data and does not describe a verified purification performance.
 */
export class FiltrationSystem {
  constructor(parent, model) {
    this.parent = parent;
    this.model = model || null;
    this.pumpOn = FILTRATION.pumpOn;
    this.treatmentOn = false;
    this.treatmentProgress = 0;

    this.lakeAlgae = FILTRATION.lakeAlgaeStart;
    this.flow = this.pumpOn ? 1 : 0;
    this.saturation = 0;
    this.capturedMass = 0;
    this.efficiency = FILTRATION.efficiencyMax;
    this.outletAlgae = 0;

    this.maxCapturedParticles = 900;
    this.capturedCount = 0;

    // Captured algae flecks (instanced), settling inside the chambers.
    const geo = new THREE.IcosahedronGeometry(0.006, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f7a24, roughness: 0.75, emissive: 0x143a08, emissiveIntensity: 0.35 });
    this.flecks = new THREE.InstancedMesh(geo, mat, this.maxCapturedParticles);
    this.flecks.count = 0;
    this.flecks.frustumCulled = false;
    this.flecks.castShadow = false;
    parent.add(this.flecks);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);

    // Water jet leaving the discharge port (visual, strength = flow).
    this._buildDischargeJet();
  }

  _buildDischargeJet() {
    const geo = new THREE.ConeGeometry(0.055, 0.42, 16, 1, true);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(0.21, 0, 0);
    this.jetMaterial = new THREE.MeshBasicMaterial({
      color: 0xbfeaf2,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.jet = new THREE.Mesh(geo, this.jetMaterial);
    this.jet.position.set(1.52, -0.02, 0.30);
    this.jet.renderOrder = 5;
    this.parent.add(this.jet);
  }

  setPump(on) {
    this.pumpOn = !!on;
    if (!this.pumpOn) this.flow = 0;
  }

  togglePump() {
    this.setPump(!this.pumpOn);
    return this.pumpOn;
  }

  setTreatment(on) {
    this.treatmentOn = !!on;
  }

  setTreatmentProgress(progress) {
    this.treatmentProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  }

  /**
   * Advance the model.
   * @returns {boolean} true when a passing particle is removed by the media
   */
  tryCapture(intakeAlgae) {
    return Math.random() < this.efficiency * Math.min(1, intakeAlgae * 1.6);
  }

  registerCapture() {
    if (this.capturedCount < this.maxCapturedParticles) this.capturedCount += 1;
  }

  update(dt, elapsed) {
    const F = FILTRATION;

    const target = this.pumpOn ? 1 : 0;
    const rate = dt / F.flowRiseTime;
    this.flow += Math.max(-rate, Math.min(rate, target - this.flow));

    if (this.flow > 0.001) {
      this.lakeAlgae -= this.flow * F.algaeRemoval * dt;
    } else {
      this.lakeAlgae += F.algaeGrowth * dt;
    }

    if (this.treatmentOn && this.treatmentProgress > 0) {
      this.lakeAlgae -= F.ultrasonicRemoval * (this.treatmentProgress / 100) * dt;
    }
    this.lakeAlgae = Math.max(F.algaeMin, Math.min(F.algaeMax, this.lakeAlgae));

    this.efficiency = F.efficiencyMax * (1 - F.efficiencyLoss * this.saturation);
    this.outletAlgae = this.lakeAlgae * (1 - this.efficiency);
    this.capturedMass += this.lakeAlgae * this.flow * this.efficiency * F.captureRate * dt;
    this.saturation = Math.min(1, this.capturedMass / F.mediaCapacity);

    this._updateFlecks(elapsed);
    this._updateMediaLoading();
    this._updateJet();
  }

  _updateFlecks(elapsed) {
    // Desired visual count tracks the saturation of the media.
    const want = Math.round(this.saturation * this.maxCapturedParticles);
    this.flecks.count = Math.max(0, Math.min(this.maxCapturedParticles, want));

    const chambers = CHAMBERS;
    for (let i = 0; i < this.flecks.count; i++) {
      // Deterministic scatter so flecks do not jump between frames.
      const h1 = ((i * 9301 + 49297) % 233280) / 233280;
      const h2 = ((i * 4801 + 12983) % 233280) / 233280;
      const h3 = ((i * 2333 + 7919) % 233280) / 233280;

      const ch = chambers[1 + Math.floor(h3 * 2)]; // A or B
      const r = Math.sqrt(h1) * ch.radius * 0.88;
      const a = h2 * Math.PI * 2;
      const settle = (i / Math.max(1, this.flecks.count));
      const y = ch.center.y - ch.height / 2 + 0.012 + settle * ch.height * 0.9;

      this._p.set(ch.center.x + Math.cos(a) * r, y, ch.center.z + Math.sin(a) * r);
      this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a * 3.0);
      const pulse = 0.85 + 0.15 * Math.sin(elapsed * 2 + i);
      this._s.setScalar(pulse);
      this._m.compose(this._p, this._q, this._s);
      this.flecks.setMatrixAt(i, this._m);
    }
    this.flecks.instanceMatrix.needsUpdate = true;
  }

  _updateMediaLoading() {
    // Media darkens/greens as it loads, and a green film creeps up the column.
    if (!this.model || !this.model.chamberGroups) return;
    const loaded = new THREE.Color(0x2f6b1c);
    Object.values(this.model.chamberGroups).forEach((entry) => {
      if (!entry.media || !entry.media.material) return;
      const m = entry.media.material;
      if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
      m.color.copy(m.userData.baseColor).lerp(loaded, this.saturation * 0.65);
    });
  }

  _updateJet() {
    this.jetMaterial.opacity = this.flow * 0.55;
    const s = 0.6 + this.flow * 0.6;
    this.jet.scale.set(s, s, s);
  }

  getState() {
    return {
      pumpOn: this.pumpOn,
      flow: this.flow,
      lakeAlgae: this.lakeAlgae,
      outletAlgae: this.outletAlgae,
      efficiency: this.efficiency,
      saturation: this.saturation,
      capturedMass: this.capturedMass,
      treatmentOn: this.treatmentOn,
      treatmentProgress: this.treatmentProgress,
    };
  }

  dispose() {
    this.flecks.geometry.dispose();
    this.flecks.material.dispose();
    this.jet.geometry.dispose();
    this.jetMaterial.dispose();
    if (this.parent) {
      this.parent.remove(this.flecks);
      this.parent.remove(this.jet);
    }
  }
}
