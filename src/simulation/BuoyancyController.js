import * as THREE from 'three';
import { waveHeight, waveGradient } from './waves';

/**
 * BuoyancyController — keeps the hull riding the visible wave surface.
 *
 * Samples the same analytic wave field the water shader displaces with, then
 * applies height, pitch and roll from the local surface normal. Motion is
 * critically damped so the platform never snaps or jitters.
 */
export class BuoyancyController {
  constructor(group) {
    this.group = group;
    this.baseY = 0.0;             // waterline offset for the platform
    this.pos = new THREE.Vector3();
    this.pitch = 0;
    this.roll = 0;
    this.grad = { x: 0, z: 0 };
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._probe = new THREE.Vector3();
  }

  /** Current water height under the hull centre. */
  heightAt(x, z, elapsed) {
    return waveHeight(x, z, elapsed) + this.baseY;
  }

  /**
   * @param {number} dt seconds
   * @param {number} elapsed seconds
   * @param {object} motion { extraPitch, extraRoll } from acceleration/steering
   */
  update(dt, elapsed, motion = {}) {
    const p = this.group.position;

    const h = waveHeight(p.x, p.z, elapsed);
    const targetY = h + this.baseY;

    // Vertical follow: snappier going up than down, like a real float.
    const k = targetY > p.y ? 9.0 : 5.0;
    p.y += (targetY - p.y) * Math.min(1, k * dt);

    // Surface slope from the gradient, split into pitch/roll in hull space.
    waveGradient(p.x, p.z, elapsed, this.grad);

    this._fwd.set(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
    this._right.set(this._fwd.z, 0, -this._fwd.x);

    const slopeFwd = this.grad.x * this._fwd.x + this.grad.z * this._fwd.z;
    const slopeRight = this.grad.x * this._right.x + this.grad.z * this._right.z;

    const targetPitch = -Math.atan(slopeFwd) + (motion.extraPitch || 0);
    const targetRoll = Math.atan(slopeRight) + (motion.extraRoll || 0);

    const damp = Math.min(1, 6.0 * dt);
    this.pitch += (targetPitch - this.pitch) * damp;
    this.roll += (targetRoll - this.roll) * damp;

    this.group.rotation.x = this.pitch;
    this.group.rotation.z = this.roll;

    this.pos.copy(p);
  }

  /** World position of a local point on the hull. */
  localToWorld(local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.group.matrixWorld);
  }
}
