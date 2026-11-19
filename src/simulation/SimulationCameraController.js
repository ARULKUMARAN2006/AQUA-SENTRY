import * as THREE from 'three';
import { CAMERA_MODES } from './config';

/**
 * SimulationCameraController — five inspection views.
 *
 *   1 Follow        scripted, damped, follows heading
 *   2 Free orbit    full orbit / zoom / pan with the mouse
 *   3 Top-down      above the hull, shows heading and lake position
 *   4 Underwater    below the surface, looking up at the submerged hardware
 *   5 Filter close  tight on the transparent filter columns
 *
 * Switching never touches the simulation state; scripted views cross-fade from
 * wherever the camera currently is, and orbit views are handed the current
 * pose so the cut is invisible.
 */
export class SimulationCameraController {
  constructor(camera, orbitControls, robotGroup) {
    this.camera = camera;
    this.controls = orbitControls;
    this.robot = robotGroup;

    this.mode = 1;
    this.blend = 1;             // 0..1 cross-fade progress
    this.blendTime = 1.1;

    this._pos = new THREE.Vector3(4.2, 2.6, -5.0);
    this._look = new THREE.Vector3(0, 0.4, 0);
    this._targetPos = this._pos.clone();
    this._targetLook = this._look.clone();

    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._orbitPos = new THREE.Vector3();
    this._orbitLook = new THREE.Vector3();
    this._smoothPos = new THREE.Vector3().copy(this._pos);
    this._smoothLook = new THREE.Vector3().copy(this._look);

    this.onModeChange = null;
  }

  setMode(mode) {
    const m = CAMERA_MODES.find((c) => c.id === mode);
    if (!m || mode === this.mode) return;
    this.mode = mode;

    // Every mode gets a concrete pose: the scripted views lerp towards it,
    // the orbit views are handed it directly (with the matching target) so a
    // switch is seamless and never resets the simulation.
    const look = this._computeLook(mode, this._orbitLook);
    const pos = this._computePosition(mode, this._orbitPos);

    if (this.isOrbitMode(mode)) {
      this.controls.target.copy(look);
      this.controls.enabled = true;
      // Frame the subject: pull back along the view vector to a sensible distance.
      const dist = mode === 2 ? 6.2 : mode === 5 ? 1.5 : 3.4;
      const dir = pos.clone().sub(look);
      if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.5, 0.6);
      this.camera.position.copy(look).add(dir.normalize().multiplyScalar(dist));
      this.camera.lookAt(look);
      this.controls.update();
      this._syncFromCamera();
    } else {
      this.controls.enabled = false;
      this._smoothPos.copy(this.camera.position);
      this._smoothLook.copy(look);
      this.blend = 0;
    }

    if (this.onModeChange) this.onModeChange(m);
  }

  isOrbitMode(mode) {
    return mode === 2 || mode === 4 || mode === 5;
  }

  _computePosition(mode, out = new THREE.Vector3()) {
    const p = this.robot.position;
    const yaw = this.robot.rotation.y;
    const fwd = this._fwd.set(Math.sin(yaw), 0, Math.cos(yaw));

    switch (mode) {
      case 1: // follow: behind and above
        return out.set(
          p.x - fwd.x * 5.0,
          p.y + 2.3,
          p.z - fwd.z * 5.0,
        );
      case 3: // top machine
        return out.set(p.x, p.y + 4.6, p.z + 0.001);
      case 4: // underwater, off the port bow looking at the treatment module
        return out.set(
          p.x - fwd.x * 3.4 - fwd.z * 2.4,
          p.y - 1.15,
          p.z - fwd.z * 3.4 + fwd.x * 2.4,
        );
      case 5: // filter close-up: beside the filter columns (starboard)
        return out.set(p.x + 2.0, p.y + 0.95, p.z + 1.35);
      default:
        return out.copy(this.camera.position);
    }
  }

  _computeLook(mode, out = new THREE.Vector3()) {
    const p = this.robot.position;
    switch (mode) {
      case 1:
        return out.set(p.x, p.y + 0.45, p.z);
      case 3:
        return out.set(p.x, p.y + 0.12, p.z);
      case 4:
        // Frame the ultrasonic module and the algae field beneath the hull.
        this.robot.updateMatrixWorld();
        return out.copy(UNDERWATER_FOCUS).applyMatrix4(this.robot.matrixWorld);
      case 5:
        // Look at the transparent filter columns on the starboard deck.
        this.robot.updateMatrixWorld();
        return out.copy(FILTER_FOCUS).applyMatrix4(this.robot.matrixWorld);
      default:
        return out.set(p.x, p.y + 0.4, p.z);
    }
  }

  update(dt) {
    if (this.isOrbitMode(this.mode)) {
      this.controls.enabled = true;
      this.controls.update();
      this._syncFromCamera();
      return;
    }

    this.controls.enabled = false;

    this._targetPos.copy(this._computePosition(this.mode));
    this._targetLook.copy(this._computeLook(this.mode));

    // Critically-damped follow, frame-rate independent.
    const kPos = 1 - Math.exp(-(this.mode === 1 ? 3.4 : 4.5) * dt);
    const kLook = 1 - Math.exp(-6.0 * dt);

    this._smoothPos.lerp(this._targetPos, kPos);
    this._smoothLook.lerp(this._targetLook, kLook);

    this.camera.position.copy(this._smoothPos);
    this.camera.lookAt(this._smoothLook);

    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.blendTime);
  }

  _syncFromCamera() {
    this._smoothPos.copy(this.camera.position);
    this._smoothLook.copy(this.controls.target);
  }

  getModeInfo() {
    return CAMERA_MODES.find((c) => c.id === this.mode);
  }
}

const FILTER_FOCUS = new THREE.Vector3(0.68, 0.50, -0.18);
const UNDERWATER_FOCUS = new THREE.Vector3(0, -0.55, 0.05);
