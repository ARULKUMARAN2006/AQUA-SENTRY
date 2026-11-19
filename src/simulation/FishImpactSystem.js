import * as THREE from 'three';
import { waveHeight } from './waves';

/**
 * Fish response to the shared water-quality verdict.
 *
 *   Normal readings   → the school swims normally.
 *   Abnormal readings → the school is replaced by tilted, drifting fish to
 *                       communicate a simulated mortality event.
 *
 * This is a communication aid for the digital twin, not wildlife data.
 */
export class FishImpactSystem {
  constructor(scene) {
    this.scene = scene;
    this.healthy = true;
    this.scenario = false; // "algae impact" demo flag (status only)
    this.elapsed = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.fish = [];
    this.deadFish = [];
    this._buildFish();
    this._buildDeadFish();
    this._applyState();
  }

  _fishMesh(color = 0xf59e0b, dead = false) {
    const fish = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.62,
      metalness: 0.05,
      transparent: dead,
      opacity: dead ? 0.72 : 1,
    });
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 10),
      bodyMaterial,
    );
    body.scale.set(1.7, 0.75, 0.65);
    fish.add(body);

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.32, 3),
      new THREE.MeshStandardMaterial({ color: dead ? 0x475569 : 0xd97706, roughness: 0.7 }),
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.36;
    fish.add(tail);

    const dorsal = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.2, 3),
      new THREE.MeshStandardMaterial({ color: dead ? 0x64748b : color, roughness: 0.72 }),
    );
    dorsal.rotation.z = Math.PI / 2;
    dorsal.position.set(-0.02, 0.14, 0);
    fish.add(dorsal);

    const finMaterial = new THREE.MeshStandardMaterial({
      color: dead ? 0x64748b : color,
      side: THREE.DoubleSide,
      transparent: dead,
      opacity: dead ? 0.65 : 0.9,
    });
    [-1, 1].forEach((side) => {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 3), finMaterial);
      fin.rotation.set(0, side * 0.5, side * 0.45);
      fin.position.set(0.08, -0.03, side * 0.15);
      fish.add(fin);
    });

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x111827 }),
    );
    eye.position.set(0.25, 0.08, 0.1);
    fish.add(eye);
    return fish;
  }

  _buildFish() {
    const positions = [[-2.5, 1.0, 1.4], [1.2, 1.5, -1.7], [3.1, 0.8, 0.8]];
    positions.forEach(([x, y, z], index) => {
      const mesh = this._fishMesh(index === 1 ? 0x38bdf8 : 0xf59e0b);
      mesh.position.set(x, -y, z);
      mesh.rotation.y = index % 2 ? Math.PI : 0;
      this.group.add(mesh);
      this.fish.push({ mesh, x, z, depth: y, phase: index * 1.7, delay: index * 0.35 });
    });
  }

  _buildDeadFish() {
    // Same positions as the living school so the fish appear to die in place
    // when the readings go abnormal.
    const positions = [[-2.5, 1.0, 1.4], [1.2, 1.5, -1.7], [3.1, 0.8, 0.8]];
    positions.forEach(([x, depth, z], index) => {
      const mesh = this._fishMesh(0x64748b, true);
      mesh.position.set(x, -depth, z);
      mesh.rotation.z = Math.PI / 2;
      mesh.rotation.x = 0.35;
      mesh.visible = false;
      this.group.add(mesh);
      this.deadFish.push({ mesh, x, z, depth, phase: index * 1.7 });
    });
  }

  _applyState() {
    this.fish.forEach(({ mesh }) => { mesh.visible = this.healthy; });
    this.deadFish.forEach(({ mesh }) => { mesh.visible = !this.healthy; });
  }

  /**
   * Drive the fish from the shared water-quality verdict.
   * true  = normal readings, the school swims.
   * false = abnormal readings, the mortality visual is shown.
   */
  setWaterHealth(healthy) {
    const next = !!healthy;
    if (next === this.healthy) return;
    this.healthy = next;
    this._applyState();
  }

  /** Retained for the existing "algae impact" demo button (status only). */
  setActive(active) {
    this.scenario = !!active;
  }

  getStatus() {
    return {
      healthy: this.healthy,
      scenario: this.scenario,
      label: this.healthy ? 'Normal lake life' : 'Abnormal water — fish mortality shown',
      aliveFish: this.healthy ? this.fish.length : 0,
      deadFish: this.healthy ? 0 : this.deadFish.length,
    };
  }

  update(dt, elapsed) {
    this.elapsed = elapsed;

    if (this.healthy) {
      this.fish.forEach((fish) => {
        const swim = Math.sin((elapsed - fish.delay) * 1.8);
        const x = fish.x + Math.sin(elapsed * 0.35 + fish.phase) * 0.25;
        const z = fish.z + Math.cos(elapsed * 0.3 + fish.phase) * 0.2;
        fish.mesh.position.set(x, waveHeight(x, z, elapsed) - fish.depth + swim * 0.04, z);
        fish.mesh.rotation.z = swim * 0.08;
        fish.mesh.rotation.y += dt * 0.25;
      });
      return;
    }

    this.deadFish.forEach((fish, index) => {
      const x = fish.x + Math.sin(elapsed * 0.12 + index) * 0.15;
      const z = fish.z + Math.cos(elapsed * 0.1 + index) * 0.15;
      fish.mesh.position.set(
        x,
        waveHeight(x, z, elapsed) - fish.depth + Math.sin(elapsed * 0.18 + fish.phase) * 0.03,
        z,
      );
      fish.mesh.rotation.y += dt * 0.03;
    });
  }

  dispose() {
    this.group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    this.scene.remove(this.group);
  }
}
