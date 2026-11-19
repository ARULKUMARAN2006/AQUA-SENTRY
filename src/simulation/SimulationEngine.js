import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { LakeEnvironment } from './LakeEnvironment.js';
import { WaterSurface } from './WaterSurface.js';
import { AquaSentryModel } from './AquaSentryModel.js';
import { PipeNetwork } from './PipeNetwork.js';
import { WaterFlowSystem } from './WaterFlowSystem.js';
import { FiltrationSystem } from './FiltrationSystem.js';
import { AlgaeParticleSystem } from './AlgaeParticleSystem.js';
import { WakeSystem } from './WakeSystem.js';
import { PropellerSystem } from './PropellerSystem.js';
import { SensorSystem, SENSOR_SPECS } from './SensorSystem.js';
import { UnderwaterEnvironment } from './UnderwaterEnvironment.js';
import { BuoyancyController } from './BuoyancyController.js';
import { RobotMovementController } from './RobotMovementController.js';
import { SimulationCameraController } from './SimulationCameraController.js';
import { FishImpactSystem } from './FishImpactSystem.js';
import { ROBOT, CAMERA_MODES } from './config';

/**
 * SimulationEngine — owns the renderer, the scene graph and the single
 * animation loop. All per-frame simulation state lives here or in the
 * subsystems; React is only told about coarse state changes (camera mode,
 * pump on/off) so the scene never re-renders per particle or per frame.
 */
export class SimulationEngine {
  constructor(canvas, onStateChange) {
    this.canvas = canvas;
    this.onStateChange = onStateChange || (() => {});
    this.disposed = false;
    this.frame = null;
    this.clock = new THREE.Clock();

    // Live sensor readings pushed in from the shared dashboard context, so the
    // 3D indicators and the dashboard can never disagree.
    this.sensorState = {
      readings: {},
      operating: {},
    };

    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._tmpV3 = new THREE.Vector3();
    // Exhaust points stay in hull-local space; world positions are derived.
    this._exhaustLocal = ROBOT.thrusters.map((t) => new THREE.Vector3(t.x, t.y + 0.02, t.z - 0.16));

    this._initRenderer();
    this._initScene();
    this._initSubsystems();
    this._initInput();
    this._initResize();

    this.clock.start();
    this._loop();

    if (import.meta.env && import.meta.env.DEV) {
      // Handy handle for debugging in the console during development.
      window.__aquaSentry = this;
    }
  }

  // ── Renderer ────────────────────────────────────────────────────────────────
  _initRenderer() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      // keeps the frame readable after render so the view can be captured
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.autoUpdate = false;
    this.renderer = renderer;

    this.size = new THREE.Vector2();
    renderer.getSize(this.size);

    // No planar reflection render target: the water is a diffuse surface, so
    // nothing from the scene is mirrored into the lake.
  }

  // ── Scene ───────────────────────────────────────────────────────────────────
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbcd8ea, 0.0021);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.08, 2600);
    this.camera.position.set(5.5, 2.8, -5.5);

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.075;
    this.orbit.minDistance = 1.2;
    this.orbit.maxDistance = 60;
    this.orbit.maxPolarAngle = Math.PI * 0.68; // allow inspecting from just below the surface
    this.orbit.enabled = false;

    this.robotPivot = new THREE.Group();
    this.scene.add(this.robotPivot);
  }

  _initSubsystems() {
    this.env = new LakeEnvironment(this.scene, this.renderer);
    this.water = new WaterSurface(this.scene);

    this.model = new AquaSentryModel(this.robotPivot);
    this.pipes = new PipeNetwork(this.robotPivot);

    this.filtration = new FiltrationSystem(this.robotPivot, this.model);
    this.flow = new WaterFlowSystem(this.robotPivot, this.pipes, { count: 800 });
    this.filtration.setPump(this.flow.active);

    this.algae = new AlgaeParticleSystem(this.scene);
    this.wake = new WakeSystem(this.scene, this.robotPivot);
    this.propellers = new PropellerSystem(this.robotPivot, this.model.thrusterDucts);
    this.sensors = new SensorSystem(this.robotPivot);
    // Underwater-only scenery + treatment module (camera view 4).
    this.underwater = new UnderwaterEnvironment(this.scene, this.robotPivot);
    this.fishImpact = new FishImpactSystem(this.scene);

    this.buoyancy = new BuoyancyController(this.robotPivot);
    this.movement = new RobotMovementController(this.robotPivot, window);
    this.cameras = new SimulationCameraController(this.camera, this.orbit, this.robotPivot);

    this._syncThrustWorldPositions();
  }

  _syncThrustWorldPositions() {
    // Nothing to precompute: the duct positions come from ROBOT.thrusters.
  }

  // ── Input ───────────────────────────────────────────────────────────────────
  _initInput() {
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyF':
          e.preventDefault();
          this.togglePump();
          break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
          e.preventDefault();
          this.setCameraMode(Number(e.code.slice(5)));
          break;
        case 'KeyC':
          e.preventDefault();
          this.cycleCamera();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  togglePump() {
    const on = this.filtration.togglePump();
    this.flow.setActive(on);
    this.onStateChange({ pumpOn: on, reason: 'pump' });
    return on;
  }

  /** Ultrasonic treatment module on/off (underwater view). */
  setTreatment(on) {
    this.underwater.setTreatment(on);
    this.filtration.setTreatment(on);
    return this.underwater.treatmentOn;
  }

  toggleTreatment() {
    return this.setTreatment(!this.underwater.treatmentOn);
  }

  setTreatmentProgress(progress) {
    this.underwater.setProgress(progress);
    this.filtration.setTreatmentProgress(progress);
  }

  /** Mirror the dashboard's surviving algae fraction into the 3D field. */
  setAlgaeSurviving(fraction) {
    this.underwater.setAlgaeSurviving(fraction);
  }

  /** Mirror the shared algae-collection state into the 3D basket. */
  setAlgaeCollection(state) {
    this.underwater.setAlgaeCollection(state);
  }

  /** Empty the 3D waste basket and stop the collection particles. */
  resetCollection() {
    this.underwater.resetCollection();
  }

  /** Clear treatment visuals (pause / reset). */
  resetTreatment() {
    this.underwater.reset();
    this.filtration.setTreatment(false);
    this.filtration.setTreatmentProgress(0);
  }

  setAlgaeImpact(active) {
    this.fishImpact.setActive(active);
    return this.fishImpact.getStatus();
  }

  /**
   * Drive the fish response from the shared water-quality verdict.
   * Normal readings keep the school swimming; abnormal readings switch to the
   * simulated mortality visual.
   */
  setWaterHealth(healthy) {
    this.fishImpact.setWaterHealth(healthy);
    return this.fishImpact.getStatus();
  }

  getUnderwaterStatus() {
    return this.underwater.getStatus();
  }

  /**
   * Push the dashboard's sensor readings + operating states into the scene.
   * @param {object} state { readings, operating }
   */
  setSensorState(state) {
    if (!state) return;
    this.sensorState.readings = state.readings || {};
    this.sensorState.operating = state.operating || {};
  }

  getSensorSpecs() {
    return SENSOR_SPECS;
  }

  /** Show/hide the floating sensor labels on the 3D model. */
  setSensorLabelsVisible(visible) {
    this.sensors.setLabelsVisible(visible);
  }

  setCameraMode(mode) {
    this.cameras.setMode(mode);
    this.onStateChange({ cameraMode: mode });
  }

  cycleCamera() {
    const idx = CAMERA_MODES.findIndex((c) => c.id === this.cameras.mode);
    const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
    this.setCameraMode(next.id);
  }

  // ── Resize ──────────────────────────────────────────────────────────────────
  _initResize() {
    const resize = () => {
      const w = Math.max(1, this.canvas.clientWidth);
      const h = Math.max(1, this.canvas.clientHeight);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    this._resizeObserver = new ResizeObserver(resize);
    this._resizeObserver.observe(this.canvas);
    resize();
  }

  // ── Frame loop ──────────────────────────────────────────────────────────────
  _loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this._loop);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    this.movement.update(dt);
    this.robotPivot.updateMatrixWorld();

    this.buoyancy.update(dt, elapsed, {
      extraPitch: this.movement.extraPitch,
      extraRoll: this.movement.extraRoll,
    });

    const submerged = THREE.MathUtils.clamp(-this.robotPivot.position.y / 0.4, 0, 1);
    this.propellers.update(dt, this.movement.thrusts, submerged);

    this.filtration.update(dt, elapsed);
    const state = this.filtration.getState();

    this.water.update(elapsed, {
      algae: state.lakeAlgae,
      robotPos: this.robotPivot.position,
      speed: this.movement.speed,
    });
    this.flow.update(dt, state.flow, state.outletAlgae, this.filtration);
    this.pipes.update(elapsed, state.flow, state.lakeAlgae);

    this._updateWakeAndBubbles(dt, elapsed);
    this._updateAlgae(dt, elapsed, state);
    this.fishImpact.update(dt, elapsed);
    this.sensors.update(dt, elapsed, this.sensorState);

    // The underwater field, treatment module and status readout exist only in
    // the "4 Underwater" camera view.
    const underwaterView = this.cameras.mode === 4;
    if (underwaterView) this.underwater.update(dt, elapsed);
    else this.underwater.hide();

    this.cameras.update(dt);

    // Keep the shadow frustum around the hull for crisp contact shadows.
    this.env.followShadow(this.robotPivot.position);

    // Underwater mode affects fog, lighting and the water material.
    const camY = this.camera.position.y;
    const underwater = camY < -0.06;
    this.water.setUnderwater(underwater);
    this.env.setUnderwater(underwater);
    if (underwater) {
      this.scene.fog.color.setHex(0x0d3a3a);
      this.scene.fog.density = 0.055;
      this.scene.background = null;
    } else {
      this.scene.fog.color.setHex(0xbcd8ea);
      this.scene.fog.density = 0.0021;
    }

    this._render();

    this.telemetry = {
      speed: this.movement.speed,
      heading: this.robotPivot.rotation.y,
      rpm: this.propellers.rpm.slice(),
      filtration: state,
      cameraMode: this.cameras.mode,
      underwater,
      underwaterView,
      treatmentStatus: this.underwater.getStatus(),
      collectionStatus: this.underwater.getStatus(),
      fishImpact: this.fishImpact.getStatus(),
      fps: this.renderer.info.render.frame,
    };
  };

  _updateWakeAndBubbles(dt, elapsed) {
    const forward = this._tmpV.set(
      Math.sin(this.robotPivot.rotation.y),
      0,
      Math.cos(this.robotPivot.rotation.y),
    );

    this.wake.update(dt, elapsed, {
      speed: this.movement.speed,
      turn: this.movement.steer,
      robotPos: this.robotPivot.position,
      forward,
    });

    // Bubbles scale with actual propeller RPM.
    for (let i = 0; i < 4; i++) {
      const rpm = this.propellers.getRPM(i);
      const norm = THREE.MathUtils.clamp((rpm - 2) / 44, 0, 1);
      if (norm < 0.08) continue;
      const world = this._tmpV3.copy(this._exhaustLocal[i]).applyMatrix4(this.robotPivot.matrixWorld);
      const moving = Math.abs(this.movement.thrusts[i]) > 0.15 ? 1 : 0.35;
      this.algae.emitBubbles(world, norm * moving, dt);
    }
  }

  _updateAlgae(dt, elapsed, state) {
    const intakeLocal = this._tmpV2.set(-1.62, -0.02, 0.30);
    this.algae.update(dt, elapsed, {
      concentration: state.lakeAlgae,
      robot: this.robotPivot,
      flowRate: state.flow,
      intakeLocal,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  _render() {
    // Shadow maps are refreshed once per frame here. There is no reflection
    // pass any more, so the scene is drawn exactly once per frame.
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  // ── Teardown ────────────────────────────────────────────────────────────────
  dispose() {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this._onKeyDown);
    this._resizeObserver.disconnect();
    this.movement.dispose();
    this.orbit.dispose();
    this.fishImpact.dispose();

    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    this.renderer.dispose();
  }
}
