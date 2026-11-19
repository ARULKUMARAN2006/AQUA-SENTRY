import * as THREE from 'three';
import { MOVEMENT, LAKE } from './config';
import { shoreRadius } from './waves';

/**
 * RobotMovementController — direct keyboard control of the prototype.
 *
 *   ArrowUp / W    ahead
 *   ArrowDown / S   astern
 *   ArrowLeft / A   turn to port
 *   ArrowRight / D  turn to starboard
 *   Space           stop: propulsion cut, hull decelerates and settles
 *
 * Movement is delta-time based, so the behaviour is identical at any frame
 * rate. Per-thruster demand is exposed for the propellers and the wake.
 */
export class RobotMovementController {
  constructor(group, target) {
    this.group = group;
    this.target = target || window;

    this.keys = Object.create(null);
    this.speed = 0;            // m/s, negative = astern
    this.yawRate = 0;          // rad/s
    this.throttle = 0;
    this.steer = 0;
    this.thrusts = [0, 0, 0, 0];
    this.extraPitch = 0;
    this.extraRoll = 0;
    this.prevSpeed = 0;
    this.boundaryHit = 0;

    this._fwd = new THREE.Vector3();
    this._presses = 0;

    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onBlur = () => { this.keys = Object.create(null); };

    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('keyup', this._onKeyUp);
    this.target.addEventListener('blur', this._onBlur);
  }

  _key(e, down) {
    const code = e.code;
    const tracked = [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
    ];
    if (tracked.includes(code)) {
      e.preventDefault();
      this.keys[code] = down;
      if (down && code === 'Space') this._presses++;
    }
  }

  get braking() {
    return !!this.keys.Space;
  }

  update(dt) {
    const k = this.keys;
    const fwdIn = (k.ArrowUp || k.KeyW) ? 1 : 0;
    const backIn = (k.ArrowDown || k.KeyS) ? 1 : 0;
    const leftIn = (k.ArrowLeft || k.KeyA) ? 1 : 0;
    const rightIn = (k.ArrowRight || k.KeyD) ? 1 : 0;

    const demand = (fwdIn ? 1 : 0) - (backIn ? 1 : 0);
    const steerIn = (rightIn ? 1 : 0) - (leftIn ? 1 : 0);

    const maxF = MOVEMENT.maxSpeed;
    const maxR = MOVEMENT.maxSpeed * MOVEMENT.reverseFactor;

    // --- Surge ---------------------------------------------------------------
    if (this.braking) {
      const decel = MOVEMENT.brakeDecel * dt;
      this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - decel);
      this.throttle += (0 - this.throttle) * Math.min(1, 8 * dt);
    } else if (demand !== 0) {
      const target = demand > 0 ? maxF : -maxR;
      // Do not push past the limit in the requested direction
      if (Math.sign(this.speed) !== Math.sign(target) && this.speed !== 0) {
        this.speed += target * MOVEMENT.accel * dt;
      } else if (Math.abs(this.speed) < Math.abs(target)) {
        this.speed += target * MOVEMENT.accel * dt;
      }
      this.speed = THREE.MathUtils.clamp(this.speed, -maxR, maxF);
      this.throttle += (demand - this.throttle) * Math.min(1, 6 * dt);
    } else {
      // Coasting: exponential drag, frame-rate independent
      const decay = Math.exp(-MOVEMENT.coastDecel * dt);
      this.speed *= decay;
      if (Math.abs(this.speed) < 0.01) this.speed = 0;
      this.throttle += (0 - this.throttle) * Math.min(1, 3.2 * dt);
    }

    // --- Yaw -----------------------------------------------------------------
    const speedNorm = Math.abs(this.speed) / maxF;
    // Thrusters bite harder once there is water flow over them
    const authority = 0.35 + 0.65 * Math.min(1, speedNorm * 1.6);
    const targetYaw = -steerIn * MOVEMENT.turnRate * authority;
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, MOVEMENT.turnAccel * dt);

    if (this.braking) {
      this.yawRate *= Math.exp(-6 * dt);
      this.steer += (0 - this.steer) * Math.min(1, 6 * dt);
    } else {
      this.steer += (steerIn - this.steer) * Math.min(1, 7 * dt);
    }

    const heading = this.group.rotation.y + this.yawRate * dt;
    this.group.rotation.y = heading;

    // --- Integrate position --------------------------------------------------
    this._fwd.set(Math.sin(heading), 0, Math.cos(heading));
    const nextX = this.group.position.x + this._fwd.x * this.speed * dt;
    const nextZ = this.group.position.z + this._fwd.z * this.speed * dt;

    // --- Shoreline constraint ------------------------------------------------
    const limit = this._shoreLimit(nextX, nextZ);
    const pos = this.group.position;
    if (limit.blocked) {
      pos.x = limit.x;
      pos.z = limit.z;
      this.speed *= 0.25;
      this.boundaryHit = 1;
      // Nudge heading back toward open water
      const toCentre = Math.atan2(-limit.z, -limit.x);
      let diff = toCentre - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y = heading + diff * Math.min(1, 1.6 * dt);
    } else {
      pos.x = nextX;
      pos.z = nextZ;
      this.boundaryHit *= 0.94;
    }

    // --- Attitude response ---------------------------------------------------
    const accel = (this.speed - this.prevSpeed) / Math.max(dt, 1e-4);
    this.prevSpeed = this.speed;
    const targetPitch = THREE.MathUtils.clamp(-accel * MOVEMENT.pitchPerAccel, -0.16, 0.16);
    this.extraPitch += (targetPitch - this.extraPitch) * Math.min(1, 7 * dt);
    const targetRoll = THREE.MathUtils.clamp(this.steer * MOVEMENT.rollPerSteer * (0.35 + speedNorm), -0.3, 0.3);
    this.extraRoll += (targetRoll - this.extraRoll) * Math.min(1, 6 * dt);

    // --- Per-thruster demand -------------------------------------------------
    // Differential thrust drives the turn; reversing swaps the sign so the
    // stern thrusters push the bow the right way.
    const dirSign = this.speed >= 0 ? 1 : -1;
    const base = this.throttle * dirSign;
    const diff = this.steer * MOVEMENT.steerThrust * dirSign;
    this.thrusts[0] = THREE.MathUtils.clamp(base + diff, -1, 1); // FL
    this.thrusts[1] = THREE.MathUtils.clamp(base - diff, -1, 1); // FR
    this.thrusts[2] = THREE.MathUtils.clamp(base + diff, -1, 1); // RL
    this.thrusts[3] = THREE.MathUtils.clamp(base - diff, -1, 1); // RR
  }

  /** Keep the hull inside the lake and out of the shallows. */
  _shoreLimit(x, z) {
    const r = Math.hypot(x, z);
    const theta = Math.atan2(z, x);
    const shore = shoreRadius(theta);
    const maxR = Math.min(shore - LAKE.robotMargin, LAKE.radius - LAKE.robotMargin);

    if (r <= maxR) return { blocked: false, x, z };

    const scale = maxR / (r || 1e-6);
    return { blocked: true, x: x * scale, z: z * scale };
  }

  get forward() {
    return this._fwd;
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('blur', this._onBlur);
  }
}
