import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SimulationEngine } from '../simulation/SimulationEngine.js';
import { CAMERA_MODES } from '../simulation/config.js';
import { useSensors } from '../context/SensorContext.jsx';
import {
  SENSOR_ORDER,
  SENSOR_STATUS,
  SENSOR_META,
  STATUS_COLOR,
} from '../data/sensorModes.js';
import { DEFAULT_THRESHOLDS } from '../data/thresholds.js';
import { Fish, Tag } from 'lucide-react';

/**
 * AquaSentrySimulation — mounts the 3D digital twin.
 *
 * No dashboard: a thin control strip for camera selection, the pump toggle and
 * the sensor operating controls. All readings come from the shared sensor
 * context, so the 3D indicators always match the monitoring dashboard.
 */
export default function AquaSentrySimulation() {
  const simulationRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [cameraMode, setCameraMode] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pumpOn, setPumpOn] = useState(true);
  const [error, setError] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [selectedSensor, setSelectedSensor] = useState('turbidity');
  const [algaeImpact, setAlgaeImpact] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(false);

  const {
    readings,
    operating,
    sensorMessages,
    faultySensors,
    isFaulty,
    failSensor,
    restoreSensor,
    mode,
    setMode,
    ultrasonicOn,
    treatmentStatus,
    toggleUltrasonic,
    collectionStatus,
    emptyBasket,
    overall,
    paused,
  } = useSensors();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let engine;
    try {
      engine = new SimulationEngine(canvas, (patch) => {
        if (patch.cameraMode) setCameraMode(patch.cameraMode);
        if (patch.pumpOn !== undefined) setPumpOn(patch.pumpOn);
      });
    } catch (e) {
      setError(e && e.message ? e.message : 'WebGL initialisation failed');
      return undefined;
    }
    engineRef.current = engine;

    const id = setInterval(() => {
      const t = engine.telemetry;
      if (!t) return;
      setTelemetry({
        speed: t.speed,
        rpm: t.rpm,
        flow: t.filtration.flow,
        saturation: t.filtration.saturation,
        lakeAlgae: t.filtration.lakeAlgae,
        treatmentOn: t.treatmentStatus?.treatment === 'ACTIVE',
        algaeLevel: t.treatmentStatus?.algae,
        treatmentProgress: t.treatmentStatus?.progress ?? 0,
        fishImpact: t.fishImpact,
      });
    }, 250);

    return () => {
      clearInterval(id);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Mirror the dashboard's readings + statuses into the 3D indicators.
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setSensorState({ readings, operating });
  }, [readings, operating]);

  // Mirror the dashboard's treatment state into the 3D scene. Pausing the
  // simulation stops the waves and freezes the algae field at its current
  // density; resuming picks up exactly where it left off.
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setTreatment(ultrasonicOn && !paused);
    engineRef.current.setTreatmentProgress(treatmentStatus.progress);
    const surviving = 1 - (treatmentStatus.algaeReductionPct || 0) / 100;
    engineRef.current.setAlgaeSurviving(surviving);
  }, [ultrasonicOn, treatmentStatus.progress, treatmentStatus.algaeReductionPct, paused]);

  // Mirror the shared algae-collection state into the 3D basket + particles.
  // The basket fill and collection activity come from the same state that
  // drives the dashboard panel, so the two views cannot disagree.
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setAlgaeCollection({
      fill: (collectionStatus.basketFillPct || 0) / 100,
      active: !!collectionStatus.active && !paused,
    });
  }, [collectionStatus.basketFillPct, collectionStatus.active, paused]);

  // Fish respond to the shared water-quality verdict: normal readings keep the
  // school swimming; abnormal readings switch to the simulated mortality view.
  // Unknown is treated as "no evidence of poor water" so a failed sensor does
  // not by itself kill the fish.
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setWaterHealth(overall === 'Good' || overall === 'Unknown');
  }, [overall]);

  // The floating sensor labels are optional. The Tag button in the modes bar
  // shows/hides them so the 3D model stays uncluttered by default.
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setSensorLabelsVisible(labelsVisible);
  }, [labelsVisible]);

  const setMode_ = useCallback((id) => setMode(id), [setMode]);
  const setCam = useCallback((m) => { if (engineRef.current) engineRef.current.setCameraMode(m); }, []);
  const togglePump = useCallback(() => { if (engineRef.current) engineRef.current.togglePump(); }, []);
  const toggleTreatment = useCallback(() => {
    toggleUltrasonic();
  }, [toggleUltrasonic]);
  const toggleAlgaeImpact = useCallback(() => {
    const next = !algaeImpact;
    setAlgaeImpact(next);
    if (engineRef.current) engineRef.current.setAlgaeImpact(next);
    setMode(next ? 'abnormal' : 'normal');
  }, [algaeImpact, setMode]);
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await simulationRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === simulationRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const modeInfo = CAMERA_MODES.find((c) => c.id === cameraMode) || CAMERA_MODES[0];
  const selectedFaulty = isFaulty(selectedSensor);
  const anyFault = faultySensors.size > 0;

  // The underwater box reads the shared context directly (not the throttled
  // 3D telemetry), so its switch, progress and algae level always match the
  // actual treatment state.
  const uwSurviving = Math.max(0, Math.min(1, 1 - (treatmentStatus.algaeReductionPct || 0) / 100));
  const uwAlgaeLevel = uwSurviving > 0.66 ? 'HIGH' : uwSurviving > 0.33 ? 'MEDIUM' : 'LOW';

  // Active mode drives which control block is shown.
  const activeMode = anyFault ? 'fault' : mode;

  const cards = useMemo(() => SENSOR_ORDER.map((k) => {
    const st = operating[k] || SENSOR_STATUS.UNKNOWN;
    return {
      key: k,
      label: SENSOR_META[k].label,
      short: SENSOR_META[k].short,
      unit: DEFAULT_THRESHOLDS[k]?.unit || '',
      value: readings[k],
      display: readings[k] == null ? '---' : `${readings[k]}${DEFAULT_THRESHOLDS[k]?.unit ? ` ${DEFAULT_THRESHOLDS[k].unit}` : ''}`,
      status: st,
      color: STATUS_COLOR[st],
      message: sensorMessages[k] || '',
    };
  }), [readings, operating, sensorMessages]);

  return (
    <div ref={simulationRef} className={`as3d ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <canvas ref={canvasRef} className="as3d-canvas" />

      {error && (
        <div className="as3d-error">
          <strong>3D simulation could not start</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="as3d-topbar">
        <div className="as3d-title">
          AQUA SENTRY
          <span>3D aquatic digital twin</span>
        </div>
        <div className="as3d-cams">
          <button
            className="as3d-cam as3d-fullscreen"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen (Esc)' : 'Show simulation in full screen'}
          >
            {isFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
          {CAMERA_MODES.map((c) => (
            <button
              key={c.id}
              className={`as3d-cam ${cameraMode === c.id ? 'active' : ''}`}
              onClick={() => setCam(c.id)}
              title={c.hint}
            >
              {c.key} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="as3d-modes">
        <span className="as3d-mode-label">Operating mode</span>
        <button
          className={`as3d-mode ${activeMode === 'normal' ? 'active normal' : ''}`}
          onClick={() => setMode_('normal')}
        >
          NORMAL READINGS
        </button>
        <button
          className={`as3d-mode ${activeMode === 'abnormal' ? 'active abnormal' : ''}`}
          onClick={() => setMode_('abnormal')}
        >
          ABNORMAL READINGS
        </button>
        <button
          className={`as3d-mode ${activeMode === 'fault' ? 'active fault' : ''}`}
          onClick={() => document.querySelector('.as3d-fail')?.scrollIntoView({ block: 'nearest' })}
        >
          SENSOR FAILURE{faultySensors.size ? ` (${faultySensors.size})` : ''}
        </button>
        <button
          className={`as3d-mode ${algaeImpact ? 'active algae' : ''}`}
          onClick={toggleAlgaeImpact}
          title="Switch to abnormal readings — the fish respond to the water quality"
        >
          <Fish size={14} /> {algaeImpact ? 'HIDE ALGAE IMPACT' : 'SHOW ALGAE IMPACT'}
        </button>
        <button
          className={`as3d-mode ${labelsVisible ? 'active normal' : ''}`}
          onClick={() => setLabelsVisible((v) => !v)}
          title={labelsVisible ? 'Hide the floating sensor labels' : 'Show the floating sensor labels'}
          aria-pressed={labelsVisible}
        >
          <Tag size={14} /> {labelsVisible ? 'HIDE LABELS' : 'SHOW LABELS'}
        </button>
      </div>

      <div className="as3d-bottom">
        <div className="as3d-keys">
          <span><kbd>↑</kbd><kbd>↓</kbd> ahead / astern</span>
          <span><kbd>←</kbd><kbd>→</kbd> turn</span>
          <span><kbd>Space</kbd> stop</span>
          <span><kbd>F</kbd> pump</span>
          <span><kbd>1</kbd>–<kbd>5</kbd> cameras</span>
        </div>

        <div className="as3d-readout">
          <div className="as3d-sensors">
            {cards.map((c) => (
              <div key={c.key} className={`as3d-sensor-card ${c.status.toLowerCase()}`} style={{ borderLeftColor: c.color }}>
                <div className="as3d-sensor-top">
                  <span className="as3d-sensor-name">{c.label}</span>
                </div>
                <div className="as3d-sensor-val">{c.display}</div>
                <div className="as3d-sensor-st" style={{ color: c.color }}>{c.status}</div>
                <div className="as3d-sensor-msg">{c.message}</div>
              </div>
            ))}
          </div>

          <div className="as3d-fail">
            <span className="as3d-fail-label">Sensor failure</span>
            <select
              className="as3d-select"
              value={selectedSensor}
              onChange={(e) => setSelectedSensor(e.target.value)}
              aria-label="Select sensor"
            >
              {SENSOR_ORDER.map((k) => (
                <option key={k} value={k}>{SENSOR_META[k].label} Sensor</option>
              ))}
            </select>
            {selectedFaulty ? (
              <button className="as3d-pump warn" onClick={() => restoreSensor(selectedSensor)}>
                Restore Sensor
              </button>
            ) : (
              <button className="as3d-pump fail" onClick={() => failSensor(selectedSensor)}>
                Simulate Failure
              </button>
            )}
          </div>

          <div className="as3d-row">
            <button className={`as3d-pump ${pumpOn ? 'on' : ''}`} onClick={togglePump}>
              Pump {pumpOn ? 'ON' : 'OFF'}
            </button>
            {telemetry && (
              <div className="as3d-stats">
                <span>speed <b>{telemetry.speed.toFixed(2)}</b> m/s</span>
                <span>thruster <b>{(telemetry.rpm[0] || 0).toFixed(0)}</b> rad/s</span>
                <span>flow <b>{(telemetry.flow * 100).toFixed(0)}</b>%</span>
                <span>algae <b>{(telemetry.lakeAlgae * 100).toFixed(0)}</b>%</span>
              </div>
            )}
          </div>
          {!(overall === 'Good' || overall === 'Unknown') && (
            <div className="as3d-impact-alert" role="status">
              <strong>Abnormal water quality — fish mortality simulated</strong>
              <span>Fish are shown dead while readings are outside the normal range. This is a visual simulation, not wildlife data.</span>
            </div>
          )}
          <div className="as3d-hint">{modeInfo.hint}</div>
        </div>
      </div>

      <div className="as3d-disclaimer as3d-hidden" aria-hidden="true" />

      {/* Underwater status + collection readouts — shown only in camera view 4. */}
      {cameraMode === 4 && (
        <>
          <div className="as3d-underwater">
            <div className="as3d-uw-title">Underwater status</div>
            <div className="as3d-uw-rows">
              <div className="as3d-uw-row">
                <span>Ultrasonic Treatment</span>
                <span className={`as3d-uw-val ${ultrasonicOn ? 'on' : 'off'}`}>
                  {ultrasonicOn ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="as3d-uw-row">
                <span>Algae Level</span>
                <span className={`as3d-uw-val lvl-${uwAlgaeLevel.toLowerCase()}`}>
                  {uwAlgaeLevel}
                </span>
              </div>
              <div className="as3d-uw-row">
                <span>Treatment Progress</span>
                <span className="as3d-uw-val">{treatmentStatus.progress}%</span>
              </div>
            </div>
            <div className="as3d-uw-track">
              <div className="as3d-uw-fill" style={{ width: `${treatmentStatus.progress}%` }} />
            </div>
            <button
              className={`as3d-pump ${ultrasonicOn ? 'on' : ''}`}
              onClick={toggleTreatment}
            >
              Ultrasonic treatment {ultrasonicOn ? 'ON' : 'OFF'}
            </button>
            <p className="as3d-uw-note">
              Visual simulation of algae clearing inside the wavefront. Not a measurement of treatment effectiveness.
            </p>
          </div>

          <div className="as3d-collection">
            <div className="as3d-uw-title">Algae collection</div>
            <div className="as3d-uw-rows">
              <div className="as3d-uw-row">
                <span>Collector</span>
                <span className={`as3d-uw-val ${collectionStatus.active ? 'on' : 'off'}`}>
                  {collectionStatus.wasteFull
                    ? 'FULL'
                    : collectionStatus.active
                      ? 'ACTIVE'
                      : 'IDLE'}
                </span>
              </div>
              <div className="as3d-uw-row">
                <span>Collected this session</span>
                <span className="as3d-uw-val">{collectionStatus.sessionCollectedMg} mg</span>
              </div>
              <div className="as3d-uw-row">
                <span>Remaining algae</span>
                <span className="as3d-uw-val">{collectionStatus.remainingAlgae}</span>
              </div>
              <div className="as3d-uw-row">
                <span>Basket fill</span>
                <span className={`as3d-uw-val ${collectionStatus.wasteFull ? 'lvl-high' : ''}`}>
                  {collectionStatus.basketFillPct}%
                </span>
              </div>
            </div>
            <div className="as3d-uw-track">
              <div
                className={`as3d-uw-fill basket ${collectionStatus.wasteFull ? 'full' : ''}`}
                style={{ width: `${collectionStatus.basketFillPct}%` }}
              />
            </div>
            <div className="as3d-uw-row">
              <span>Collection progress</span>
              <span className="as3d-uw-val">{collectionStatus.collectionProgressPct}%</span>
            </div>
            {collectionStatus.wasteFull && (
              <div className="as3d-waste-alert" role="alert">
                Waste basket full — empty to continue collecting.
              </div>
            )}
            <button
              className="as3d-pump"
              onClick={emptyBasket}
              disabled={collectionStatus.collectedMg === 0}
            >
              Empty basket
            </button>
            <p className="as3d-uw-note">
              Simulated capture stage. Ultrasonic treatment disrupts algae; the basket represents a separate physical collection step. Not measured removal.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
