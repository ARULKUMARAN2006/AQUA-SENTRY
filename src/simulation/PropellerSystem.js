import * as THREE from 'three';
import { ROBOT, PROPELLER } from './config';

/**
 * PropellerSystem — four ducted thrusters with RPM tied to actual thrust.
 *
 * Blade spin-up/spin-down is smoothed, reverse thrust reverses rotation, and
 * the resulting RPM is what the WakeSystem uses to emit bubbles, so the
 * propeller, the wake and the motion all read from the same state.
 */
export class PropellerSystem {
  constructor(parent, ducts) {
    this.parent = parent;
    this.ducts = ducts || [];
    this.rotors = [];
    this.rpm = [0, 0, 0, 0];
    this.angle = [0, 0, 0, 0];

    const hubMat = new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.35, metalness: 0.85 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.4, metalness: 0.6 });

    ROBOT.thrusters.forEach((t, i) => {
      const duct = this.ducts[i];
      const host = duct || parent;

      const rotor = new THREE.Group();
      // The duct group is already positioned at the thruster location.
      rotor.position.set(duct ? 0 : t.x, duct ? 0 : t.y, duct ? 0 : t.z);
      host.add(rotor);

      // Hub
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.075, 14), hubMat);
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);

      const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), hubMat);
      spinner.position.z = 0.045;
      spinner.scale.z = 1.6;
      rotor.add(spinner);

      // Three pitched blades
      const bladeGroup = new THREE.Group();
      rotor.add(bladeGroup);
      for (let b = 0; b < 3; b++) {
        const pivot = new THREE.Group();
        pivot.rotation.z = (b / 3) * Math.PI * 2;

        const shape = new THREE.Shape();
        shape.moveTo(0.022, -0.020);
        shape.quadraticCurveTo(0.075, -0.036, 0.112, -0.014);
        shape.quadraticCurveTo(0.122, 0.0, 0.108, 0.020);
        shape.quadraticCurveTo(0.070, 0.040, 0.024, 0.022);
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1,
        });
        const blade = new THREE.Mesh(geo, bladeMat);
        blade.rotation.y = Math.PI / 2;
        blade.rotation.x = 0.55;
        blade.position.z = -0.01;
        blade.castShadow = true;
        pivot.add(blade);
        bladeGroup.add(pivot);
      }

      this.rotors.push({ rotor, bladeGroup });
    });
  }

  /**
   * @param {number} dt seconds
   * @param {number[]} thrusts per-thruster demand in [-1, 1]
   * @param {number} submerged 0..1 how submerged the rotor is (air = free spin)
   */
  update(dt, thrusts, submerged = 1) {
    for (let i = 0; i < this.rotors.length; i++) {
      const demand = Math.max(-1, Math.min(1, thrusts[i] || 0));
      const magnitude = Math.abs(demand);
      const targetRPM = PROPELLER.idleRPM + (PROPELLER.maxRPM - PROPELLER.idleRPM) * magnitude * submerged;

      // Asymmetric spin-up / spin-down feels mechanical rather than linear.
      const k = targetRPM > this.rpm[i] ? PROPELLER.spinUp : PROPELLER.spinDown;
      this.rpm[i] += (targetRPM - this.rpm[i]) * Math.min(1, k * dt);

      const dir = demand < -0.05 ? -1 : 1;
      this.angle[i] += this.rpm[i] * dir * dt;
      this.rotors[i].bladeGroup.rotation.z = this.angle[i];
    }
  }

  getRPM(i) {
    return this.rpm[i] || 0;
  }

  dispose() {
    this.parent.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
