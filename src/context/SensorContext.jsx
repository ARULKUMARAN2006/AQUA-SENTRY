import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  PARAM_KEYS,
  PHASE,
  PEAK_MIN,
  createEngine,
  step,
  evaluate,
  treatmentState,
  robotState,
  phaseProgress,
  contaminationValues,
  ALGAE_MODEL,
  ALGAE_COLLECTION,
} from '../data/simulation';
import { DEFAULT_THRESHOLDS } from '../data/thresholds';
import { calculateWQI } from '../utils/quality';
import {
  SENSOR_ORDER,
  SENSOR_MODES,
  SENSOR_STATUS,
  nextReading,
  generateSensorHistory,
  sensorStatus,
  explainStatus,
  FAULT_MESSAGE,
} from '../data/sensorModes';

const SensorContext = createContext(null);

const TICK_MS = 3000;
const IOT_SOURCE_URL = 'https://iotwebserver.in/table.php?id=sedj7xyj';
const IOT_ENDPOINT = 'api/iot-readings';
const IOT_POLL_MS = 30000;
const IOT_STALE_AFTER_MS = 5 * 60 * 1000;
const HISTORY_HOURS = 168; // 7 days
const HISTORY_INTERVAL = 10; // minutes

const DECIMALS = { ph: 2, turbidity: 1, temperature: 1, tds: 0, do: 1, optical: 0 };

const emptyHistory = () => {
  const h = {};
  SENSOR_ORDER.forEach((k) => { h[k] = []; });
  return h;
};

const seedReadings = (modeId) => ({ ...SENSOR_MODES[modeId].values });

function parseIoTReadings(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...document.querySelectorAll('table tr')]
    .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent.trim()))
    .filter((cells) => cells.length >= 4 && /^\d+$/.test(cells[0]));

  return rows
    .map((cells) => {
      const turbidity = Number(cells[1]);
      const temperature = Number(cells[2]);
      if (!Number.isFinite(turbidity) || !Number.isFinite(temperature)) return null;
      const parsedTime = Date.parse(cells[3]);
      const timeCandidates = Number.isNaN(parsedTime)
        ? []
        : [parsedTime - 12 * 60 * 60 * 1000, parsedTime, parsedTime + 12 * 60 * 60 * 1000];
      const time = timeCandidates.length
        ? timeCandidates.reduce((closest, candidate) =>
          Math.abs(candidate - Date.now()) < Math.abs(closest - Date.now()) ? candidate : closest
        )
        : Date.now();
      return {
        turbidity,
        temperature,
        time,
      };
    })
    .filter(Boolean);
}

/**
 * Ultrasonic treatment effect — SIMULATION ONLY.
 *
 * These rates describe how the demo dashboard animates while the ultrasonic
 * module runs. They are illustrative values, not a physical model:
 *   • TDS (Total Dissolved Solids, ppm) is *shown rising* on purpose. Ultrasonic
 *     treatment does not genuinely add dissolved solids; the rise is a
 *     clearly-labelled demo behaviour (disruption releases organics already
 *     bound in algae) and is NOT backed by sensor measurement.
 *   • Turbidity (NTU) falls as suspended particles are dispersed/removed.
 *
 * Unrelated sensors (pH, temperature, DO, optical) are left untouched.
 */
export const TREATMENT_EFFECT = {
  tdsRisePerSec: 7,          // ppm / s
  turbidityFallPerSec: 0.55, // NTU / s
  tdsRiseMax: 180,           // ppm above the starting value
  turbidityFallMax: 26,      // NTU below the starting value
  progressPerSec: 100 / 40,  // 0 -> 100 % over ~40 s
  algaeHighAbove: 10,        // NTU
  algaeMediumAbove: 5,       // NTU
};

export function algaeLevelFromTurbidity(turbidity) {
  const v = turbidity ?? 0;
  if (v > TREATMENT_EFFECT.algaeHighAbove) return 'HIGH';
  if (v > TREATMENT_EFFECT.algaeMediumAbove) return 'MEDIUM';
  return 'LOW';
}

export function SensorProvider({ children }) {
  const [engine, setEngine] = useState(() => createEngine());
  // The live sample the simulation is actually producing. A failed sensor keeps
  // advancing internally so it can resume instantly when restored, but the
  // public `readings` below blanks it out.
  const [rawReadings, setRawReadings] = useState(() => seedReadings('normal'));
  const [history, setHistory] = useState(null); // null = still loading
  const [paused, setPaused] = useState(false);
  const [iotReadings, setIotReadings] = useState(null);
  const [iotStatus, setIotStatus] = useState('Connecting');
  const [iotLastUpdated, setIotLastUpdated] = useState(null);
  const lastIoTTimeRef = useRef(null);
  const [thresholds, setThresholds] = useState(() => JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS)));
  const [diagnosticOverride, setDiagnosticOverride] = useState(null); // null | 'fault' | 'docked'
  const [clearedAlerts, setClearedAlerts] = useState(new Set());
  // Sensors currently simulated as failed (shared by dashboard + 3D scene).
  const [faultySensors, setFaultySensors] = useState(() => new Set());
  // Operating mode: 'normal' | 'abnormal'. Values are pinned per mode.
  const [mode, setModeState] = useState('normal');
  // Last valid reading per sensor, kept for recovery/history reference only.
  const lastValidRef = useRef(seedReadings('normal'));
  // Ultrasonic treatment module (shared by the 3D underwater view + dashboard).
  const [ultrasonicOn, setUltrasonicOn] = useState(false);
  const [treatmentProgress, setTreatmentProgress] = useState(0);
  // Algae concentration (simulation only — illustrative values).
  // algaeInitial is the concentration at the moment treatment starts;
  // algaeCurrent is the live value as contamination grows / treatment reduces it.
  const [algaeInitial, setAlgaeInitial] = useState(ALGAE_MODEL.INITIAL);
  const [algaeCurrent, setAlgaeCurrent] = useState(ALGAE_MODEL.INITIAL);
  // Algae collection stage (simulation only). `collectedAlgae` is the amount
  // currently held in the waste basket (concentration units). `basketAtStart`
  // snapshots the basket at the start of the current treatment so the
  // "collected this session" figure stays meaningful across cycles.
  const [collectedAlgae, setCollectedAlgae] = useState(0);
  const [basketAtStart, setBasketAtStart] = useState(0);
  // Baseline without the treatment effect, plus the accumulated treatment delta.
  const baseRef = useRef(seedReadings('normal'));
  const offsetsRef = useRef({ tds: 0, turbidity: 0 });
  // Smooth 0..1 ramp so switching on/off fades rather than jumps.
  const [ultrasonicBlend, setUltrasonicBlend] = useState(0);
  // Refs so the tick always sees the latest state without re-subscribing.
  const ultrasonicOnRef = useRef(false);
  const ultrasonicBlendRef = useRef(0);
  const prevPhaseRef = useRef(PHASE.MONITORING);
  const algaeInitialRef = useRef(ALGAE_MODEL.INITIAL);
  const algaeCurrentRef = useRef(ALGAE_MODEL.INITIAL);
  const collectedRef = useRef(0);
  useEffect(() => {
    ultrasonicOnRef.current = ultrasonicOn;
  }, [ultrasonicOn]);
  useEffect(() => {
    ultrasonicBlendRef.current = ultrasonicBlend;
  }, [ultrasonicBlend]);
  useEffect(() => {
    algaeCurrentRef.current = algaeCurrent;
  }, [algaeCurrent]);
  useEffect(() => {
    collectedRef.current = collectedAlgae;
  }, [collectedAlgae]);

  // Sync ultrasonic treatment with the phase engine on TRANSITIONS only:
  //  • entering the treatment stage  -> activate automatically, snapshot algae
  //  • leaving the treatment stage   -> deactivate automatically
  // While the stage is active a manual toggle (3D control) is respected, so the
  // effect deliberately does not depend on `algaeCurrent`.
  useEffect(() => {
    const phase = engine.phase;
    if (phase === prevPhaseRef.current) return;

    if (phase === PHASE.TREATING) {
      const snapshot = algaeCurrentRef.current;
      algaeInitialRef.current = snapshot;
      setAlgaeInitial(snapshot);
      // Start a new collection session against whatever is already in the
      // basket, so "collected this session" is measured from here.
      setBasketAtStart(collectedRef.current);
      setUltrasonicOn(true);
    } else if (prevPhaseRef.current === PHASE.TREATING) {
      setUltrasonicOn(false);
      // Natural completion (not a manual reset): settle on a clean result so
      // the cycle ends at 100 % progress with the bloom fully cleared.
      if (engine.recovered) {
        setTreatmentProgress(100);
        // Collect the final residual so a fully treated bloom fills the basket
        // instead of leaving a few uncollected units behind.
        const remaining = algaeCurrentRef.current;
        if (remaining > 0) {
          const capacity = ALGAE_COLLECTION.BASKET_CAPACITY_UNITS;
          const room = Math.max(0, capacity - collectedRef.current);
          const take = Math.min(remaining, room);
          if (take > 0) {
            collectedRef.current += take;
            setCollectedAlgae(collectedRef.current);
          }
        }
        algaeCurrentRef.current = 0;
        setAlgaeCurrent(0);
      }
    } else if (phase === PHASE.DEGRADING) {
      // A fresh contamination event starts a fresh treatment cycle.
      setTreatmentProgress(0);
      offsetsRef.current.tds = 0;
    }
    prevPhaseRef.current = phase;
  }, [engine.phase, engine.recovered]);

  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  // Seed 7 days of simulated history around the active mode's values.
  useEffect(() => {
    const t = setTimeout(() => {
      setHistory(generateSensorHistory(mode, HISTORY_HOURS, HISTORY_INTERVAL));
    }, 250);
    return () => clearTimeout(t);
  }, [mode]);

  // Mirror the public IoT table into the dashboard's turbidity and temperature
  // readings while leaving the simulated treatment controls intact.
  useEffect(() => {
    let active = true;

    const loadIoTReadings = async () => {
      try {
        const response = await fetch(IOT_ENDPOINT, { cache: 'no-store' });
        if (!response.ok) throw new Error(`IoT source returned ${response.status}`);
        const rows = parseIoTReadings(await response.text());
        if (!rows.length) throw new Error('IoT source returned no sensor rows');

        const latest = rows[rows.length - 1];
        if (!active) return;
        setIotReadings(latest);
        setIotLastUpdated(latest.time);
        setIotStatus(Date.now() - latest.time > IOT_STALE_AFTER_MS ? 'Stale' : 'Connected');
        setHistory((current) => {
          if (!current || latest.time === lastIoTTimeRef.current) return current;
          lastIoTTimeRef.current = latest.time;
          return {
            ...current,
            turbidity: [...current.turbidity, { time: latest.time, value: latest.turbidity }].slice(-4000),
            temperature: [...current.temperature, { time: latest.time, value: latest.temperature }].slice(-4000),
          };
        });
      } catch (error) {
        if (!active) return;
        console.error('Unable to load IoT sensor readings:', error);
        setIotStatus('Unavailable');
      }
    };

    loadIoTReadings();
    const id = setInterval(loadIoTReadings, IOT_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Live simulation tick (3s).
  //
  // The effect depends on a boolean "history ready" flag rather than on the
  // history object itself. Depending on the object would re-create the interval
  // on every tick (because the tick appends to history), which risks overlapping
  // timers and makes the cycle stutter.
  const historyReady = history !== null;
  useEffect(() => {
    if (paused || !historyReady) return undefined;
    const id = setInterval(() => {
      const now = Date.now();
      const dt = TICK_MS / 1000;
      const E = TREATMENT_EFFECT;

      // --- Ultrasonic treatment: accumulate the effect gradually ----------
      // Smooth ramp IN when switching on; instant freeze when switching off
      // so readings are preserved exactly where they are and resume later.
      setUltrasonicBlend((prev) => {
        const target = ultrasonicOnRef.current ? 1 : 0;
        if (!ultrasonicOnRef.current) return 0; // instant freeze when off
        const k = dt / 1.2; // ~1.2 s ramp in
        const next = prev + Math.sign(target - prev) * Math.min(k, Math.abs(target - prev));
        return +next.toFixed(4);
      });

      const blend = ultrasonicBlendRef.current;
      if (ultrasonicOnRef.current) {
        setTreatmentProgress((p) => Math.min(100, p + E.progressPerSec * dt));
      }

      const off = offsetsRef.current;
      if (ultrasonicOnRef.current) {
        // TDS (DS) rises while treatment runs — an explicitly simulated
        // behaviour, not measured chemistry.
        off.tds = Math.min(E.tdsRiseMax, off.tds + E.tdsRisePerSec * dt);
        // Turbidity is NOT given a fixed offset: it follows the contamination
        // recovery in the phase engine, so it eases back toward the normal
        // baseline instead of being driven to 0 NTU.
      }

      // --- Algae concentration: time-based simulation ----------------------
      // The ultrasonic unit reduces the bloom whenever it is ON — whether the
      // automatic cycle started it or the operator switched it on from the 3D
      // control. With the unit OFF the bloom only grows during contamination.
      // Simulation values only.
      const engPhase = engineRef.current.phase;
      if (ultrasonicOnRef.current) {
        const perTick = (algaeInitialRef.current * E.progressPerSec * dt) / 100;
        const before = algaeCurrentRef.current;
        const nextAlgae = Math.max(ALGAE_MODEL.MIN, before - perTick);
        const removed = before - nextAlgae;
        // Update the ref immediately so the collection stage below and the next
        // tick both see the same concentration the UI is about to render.
        algaeCurrentRef.current = nextAlgae;
        setAlgaeCurrent(nextAlgae);

        // Collection stage: the algae separated by the ultrasonic field is
        // transferred into the waste basket. Collection stops when the basket
        // is full; the alert tells the operator to empty it. Simulated only.
        if (removed > 0) {
          const capacity = ALGAE_COLLECTION.BASKET_CAPACITY_UNITS;
          const room = Math.max(0, capacity - collectedRef.current);
          const take = Math.min(removed, room);
          if (take > 0) {
            collectedRef.current += take;
            setCollectedAlgae(collectedRef.current);
          }
        }
      } else if (engPhase === PHASE.DEGRADING) {
        const nextAlgae = Math.min(
          ALGAE_MODEL.MAX,
          algaeCurrentRef.current + ALGAE_MODEL.GROWTH_PER_TICK
        );
        algaeCurrentRef.current = nextAlgae;
        setAlgaeCurrent(nextAlgae);
      }

      // --- One live sample per tick, shared by display values + history -----
      // How dirty is the water right now, per the phase engine? 0 = clean,
      // 1 = a fully-developed routine event. This is what makes the readings
      // follow "Degradation detected" instead of staying pristine.
      const eng = engineRef.current;
      const refPeak = Math.max(eng.peak || PEAK_MIN, 0.1);
      const level = Math.max(0, Math.min(1, (eng.contamination || 0) / refPeak));
      // Abnormal mode pins the water as dirty regardless of the cycle.
      const dirtyBlend = mode === 'abnormal' ? 1 : level;
      // Target the FULLY contaminated values and interpolate by level — using
      // contaminationValues(contamination) here would apply the contamination
      // twice and understate how bad the water actually is.
      const dirty = contaminationValues(refPeak, eng.tick || 0);

      const next = {};
      SENSOR_ORDER.forEach((k) => {
        const base = nextReading(k, mode, baseRef.current[k]);
        baseRef.current[k] = base;
        if (base == null) { next[k] = null; return; }

        let v = base;
        // Drift the reading from the clean baseline toward the contaminated
        // one as the event develops. Jitter keeps it moving once settled.
        if (dirtyBlend > 0) {
          const target = dirty[k];
          const jitter = (Math.random() - 0.5) * (SENSOR_MODES[mode].jitter[k] ?? 0.1) * 2;
          v = base + (target - base) * dirtyBlend + jitter * (0.3 + 0.7 * dirtyBlend);
        }

        if (k === 'tds' || k === 'turbidity') {
          // Apply the ultrasonic treatment delta, scaled by the ramp so it eases in.
          v += off[k] * blend;
          v = Math.max(0, v);
        }

        if (k === 'optical') v = Math.max(0, Math.min(100, v));
        if (k === 'do') v = Math.max(0.4, Math.min(16, v));

        next[k] = +v.toFixed(DECIMALS[k] ?? 2);
        lastValidRef.current[k] = next[k];
      });

      setRawReadings(next);
      setHistory((h) => {
        if (!h) return h;
        const out = { ...h };
        SENSOR_ORDER.forEach((k) => {
          out[k] = [...h[k], { time: now, value: next[k] }].slice(-4000);
        });
        return out;
      });

      // Keep the treatment narrative in step with the water-quality condition.
      setEngine((e) => {
        const stepped = step(e, now);
        engineRef.current = stepped.engine;
        return stepped.engine;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused, historyReady, mode]);

  // Switch operating mode: repin the values and refresh the charts.
  const setMode = useCallback((next) => {
    if (!SENSOR_MODES[next]) return;
    setModeState(next);
    const pinned = seedReadings(next);
    SENSOR_ORDER.forEach((k) => { lastValidRef.current[k] = pinned[k]; });
    setRawReadings(pinned);
    if (next === 'abnormal') {
      setEngine((e) => {
        if (e.phase !== PHASE.MONITORING) return e;
        const forced = { ...e, phase: PHASE.DEGRADING, eventTicks: 0, quietTicks: 0, recovered: false };
        engineRef.current = forced;
        return forced;
      });
    }
  }, []);

  // Force a contamination event (demo control).
  const triggerEvent = () => {
    setEngine((e) => {
      if (e.phase !== PHASE.MONITORING) return e;
      const next = { ...e, phase: PHASE.DEGRADING, eventTicks: 0, quietTicks: 0, recovered: false };
      engineRef.current = next;
      return next;
    });
  };

  // Jump straight to a stage from the four-step strip (demo control).
  // 1 = clean reset, 2 = contamination, 3 = treatment, 4 = improved.
  const forcePhase = useCallback((stage) => {
    // Keep the ultrasonic switch in step with the stage: only the treatment
    // stage runs the unit. Without this a manual ON could leak into a reset or
    // a contamination stage and keep clearing algae.
    ultrasonicOnRef.current = stage === 3;
    setUltrasonicOn(stage === 3);

    if (stage === 1) {
      // Full reset back to clean monitoring.
      setTreatmentProgress(0);
      offsetsRef.current.tds = 0;
      algaeCurrentRef.current = ALGAE_MODEL.INITIAL;
      algaeInitialRef.current = ALGAE_MODEL.INITIAL;
      setAlgaeCurrent(ALGAE_MODEL.INITIAL);
      setAlgaeInitial(ALGAE_MODEL.INITIAL);
      collectedRef.current = 0;
      setCollectedAlgae(0);
      setBasketAtStart(0);
    } else if (stage === 2) {
      // A fresh event: progress restarts and the bloom regrows from here.
      setTreatmentProgress(0);
      offsetsRef.current.tds = 0;
      collectedRef.current = 0;
      setCollectedAlgae(0);
      setBasketAtStart(0);
    } else if (stage === 3) {
      // Starting treatment directly needs a bloom to treat and a fresh ramp.
      setTreatmentProgress(0);
      offsetsRef.current.tds = 0;
      const start = Math.max(algaeCurrentRef.current, ALGAE_MODEL.INITIAL);
      algaeInitialRef.current = start;
      algaeCurrentRef.current = start;
      setAlgaeInitial(start);
      setAlgaeCurrent(start);
      setBasketAtStart(collectedRef.current);
    } else if (stage === 4) {
      // Mark the treatment as complete with the bloom cleared and collect the
      // remaining separated algae into the basket (up to its capacity).
      setTreatmentProgress(100);
      const start = Math.max(algaeInitialRef.current, algaeCurrentRef.current, 1);
      const remaining = algaeCurrentRef.current;
      if (remaining > 0) {
        const capacity = ALGAE_COLLECTION.BASKET_CAPACITY_UNITS;
        const room = Math.max(0, capacity - collectedRef.current);
        const take = Math.min(remaining, room);
        if (take > 0) {
          collectedRef.current += take;
          setCollectedAlgae(collectedRef.current);
        }
      }
      algaeInitialRef.current = start;
      algaeCurrentRef.current = 0;
      setAlgaeInitial(start);
      setAlgaeCurrent(0);
    }
    setEngine((e) => {
      let next = e;
      if (stage === 2) {
        next = {
          ...e,
          phase: PHASE.DEGRADING,
          eventTicks: 0,
          quietTicks: 0,
          recovered: false,
          contamination: Math.max(e.contamination, e.peak * 0.4),
        };
      } else if (stage === 3) {
        const contamination = Math.max(e.contamination, e.peak);
        // Populate the "before" snapshot so the last-treatment table and the
        // completion transition always have valid values, even when the user
        // jumps straight to the treatment stage.
        const before = contaminationValues(contamination, e.tick || 0);
        next = {
          ...e,
          phase: PHASE.TREATING,
          treatTicks: 0,
          contamination,
          recovered: false,
          before,
          beforeStatuses: evaluate(before).statuses,
          treatmentStartedAt: Date.now(),
          treatmentSevere: !!e.severe,
        };
      } else if (stage === 4) {
        next = { ...e, phase: PHASE.MONITORING, contamination: 0, quietTicks: 0, recovered: true };
      } else {
        next = { ...e, phase: PHASE.MONITORING, contamination: 0, quietTicks: 0, recovered: false };
      }
      engineRef.current = next;
      return next;
    });
  }, []);

  // Threshold updating functions
  const updateThresholdBand = (paramKey, bandIndex, min, max) => {
    setThresholds((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (next[paramKey] && next[paramKey].bands[bandIndex]) {
        next[paramKey].bands[bandIndex].min = Number(min);
        next[paramKey].bands[bandIndex].max = Number(max);
      }
      return next;
    });
  };

  const updateGoodThreshold = (paramKey, min, max) => {
    setThresholds((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (next[paramKey] && next[paramKey].bands[0]) {
        next[paramKey].bands[0].min = Number(min);
        next[paramKey].bands[0].max = Number(max);
      }
      return next;
    });
  };

  const resetThresholds = () => {
    setThresholds(JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS)));
  };

  // Alert dismiss handlers
  const dismissAlert = (id) => {
    setClearedAlerts((prev) => new Set([...prev, id]));
  };

  const clearAllAlerts = (allIds = []) => {
    setClearedAlerts(new Set(allIds));
  };

  const restoreAlerts = () => {
    setClearedAlerts(new Set());
  };

  // Public readings: a failed sensor reports no current value (shown as "---").
  // Its last valid sample is preserved in `lastValid` for recovery/reference.
  const readings = useMemo(() => {
    const next = {
      ...rawReadings,
      ...(iotReadings
        ? { turbidity: iotReadings.turbidity, temperature: iotReadings.temperature }
        : {}),
    };
    if (faultySensors.size === 0) return next;
    faultySensors.forEach((k) => { next[k] = null; });
    return next;
  }, [rawReadings, faultySensors, iotReadings]);

  // Operating status per sensor: NORMAL / WARNING / CRITICAL / FAULT.
  // A failed sensor reports no current reading; its last valid sample is kept
  // in lastValid for recovery and reference but is never shown as current.
  const operating = useMemo(() => {
    const out = {};
    SENSOR_ORDER.forEach((k) => {
      out[k] = sensorStatus(k, readings[k], faultySensors.has(k));
    });
    return out;
  }, [readings, faultySensors]);

  const sensorMessages = useMemo(() => {
    const out = {};
    SENSOR_ORDER.forEach((k) => {
      out[k] = explainStatus(k, readings[k], operating[k]);
    });
    return out;
  }, [readings, operating]);

  // Last valid sample per sensor. Exposed as a getter so the ref is never read
  // during render (it is only consulted on restore).
  const getLastValid = useCallback((key) => lastValidRef.current[key], []);

  // Fail a single sensor. Only the selected sensor is affected.
  const failSensor = useCallback((key) => {
    setFaultySensors((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // Restore one sensor: it resumes reporting immediately.
  const restoreSensor = useCallback((key) => {
    setFaultySensors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setRawReadings((prev) => ({ ...prev, [key]: nextReading(key, mode, lastValidRef.current[key]) }));
  }, [mode]);

  const clearSensorFaults = useCallback(() => setFaultySensors(new Set()), []);
  const isFaulty = useCallback((key) => faultySensors.has(key), [faultySensors]);

  /**
   * Ultrasonic treatment on/off.
   * ON  -> TDS (DS) rises gradually, turbidity falls, progress climbs to 100 %.
   * OFF -> every value freezes exactly where it is; nothing drifts back.
   *       Switching on again resumes from the current state.
   */
  const setUltrasonic = useCallback((on) => {
    const next = !!on;
    const wasOn = ultrasonicOnRef.current;
    setUltrasonicOn((prev) => {
      if (next === prev) return prev;
      ultrasonicOnRef.current = next;
      // Progress is preserved so treatment can resume from where it left off.
      return next;
    });
    if (next && !wasOn) {
      const treating = engineRef.current?.phase === PHASE.TREATING;
      // A manual start outside the automatic treatment stage begins a fresh
      // session: snapshot the current bloom and restart the progress ramp so
      // the reduction is measured from the moment the unit was switched on.
      if (!treating) {
        const snapshot = algaeCurrentRef.current;
        algaeInitialRef.current = snapshot;
        setAlgaeInitial(snapshot);
        setTreatmentProgress(0);
        setBasketAtStart(collectedRef.current);
        offsetsRef.current.tds = 0;
      }
    }
  }, []);

  const toggleUltrasonic = useCallback(() => setUltrasonic(!ultrasonicOnRef.current), [setUltrasonic]);

  /**
   * Empty the waste basket. This discards the simulated captured mass and
   * resets collection progress; the algae still in the water is untouched.
   * If treatment is running, new algae will start accumulating immediately.
   */
  const emptyBasket = useCallback(() => {
    collectedRef.current = 0;
    setCollectedAlgae(0);
    setBasketAtStart(0);
  }, []);

  const treatmentStatus = useMemo(() => {
    const on = ultrasonicOn;
    const isTreating = engine.phase === PHASE.TREATING;
    // Keep showing the completed result during the "water improved" stage,
    // then fall back to the live value once a new event starts.
    const recovered = engine.recovered;
    // Show the measured reduction while a treatment is active (automatic or
    // manual) and keep it visible in the "water improved" stage.
    const showSnapshot = isTreating || recovered || ultrasonicOn;
    // "Initial" only has meaning once treatment has started. Before that the
    // concentration is still rising, so initial == current and reduction is 0 %.
    const initial = showSnapshot ? algaeInitial : algaeCurrent;
    const current = Math.round(algaeCurrent);
    const reductionPct =
      initial > 0
        ? Math.round(((initial - algaeCurrent) / initial) * 100)
        : 0;

    let status;
    if (!on) status = 'OFF';
    else if (treatmentProgress <= 0) status = 'ON';
    else if (treatmentProgress < 100) status = 'PROCESSING';
    else status = 'ON';

    return {
      on,
      status, // 'OFF' | 'ON' | 'PROCESSING'
      progress: Math.round(treatmentProgress),
      algaeLevel: algaeLevelFromTurbidity(rawReadings.turbidity),
      algaeInitial: Math.round(initial),
      algaeCurrent: current,
      algaeReductionPct: Math.max(0, Math.min(100, reductionPct)),
      // Explicitly labelled so nobody reads this as measured chemistry.
      tdsRiseIsSimulationOnly: true,
    };
  }, [ultrasonicOn, treatmentProgress, rawReadings.turbidity, algaeInitial, algaeCurrent, engine]);

  /**
   * Algae collection + waste basket status (simulation only).
   *
   * The live concentration values are in the same units as the What-If
   * Simulator's default (100 = 100 mg/L), so the remaining concentration can be
   * read alongside the studio. The captured *mass* is an illustrative
   * conversion (1 unit = 10 mg) for the demo, not a measured mass balance.
   */
  const collectionStatus = useMemo(() => {
    const capacityUnits = ALGAE_COLLECTION.BASKET_CAPACITY_UNITS;
    const collectedUnits = Math.max(0, Math.min(capacityUnits, collectedAlgae));
    const basketFillPct = capacityUnits > 0 ? (collectedUnits / capacityUnits) * 100 : 0;
    const sessionCollectedUnits = Math.max(0, collectedUnits - basketAtStart);
    const initial = Math.max(1, algaeInitial);
    const collectionProgressPct = Math.min(100, (sessionCollectedUnits / initial) * 100);
    const massPerUnit = ALGAE_COLLECTION.MASS_MG_PER_UNIT;
    const wasteFull = collectedUnits >= capacityUnits - 0.001;
    // Collection runs only while the ultrasonic unit is separating algae, the
    // simulation is not paused, and the basket still has room. It is driven by
    // the shared treatment state, not an independent animation.
    const active = ultrasonicOn && !paused && !wasteFull && algaeCurrent > 0.5;

    return {
      active,
      collectedUnits: +collectedUnits.toFixed(1),
      collectedMg: Math.round(collectedUnits * massPerUnit),
      capacityUnits,
      capacityMg: Math.round(capacityUnits * massPerUnit),
      basketFillPct: Math.round(basketFillPct),
      sessionCollectedUnits: +sessionCollectedUnits.toFixed(1),
      sessionCollectedMg: Math.round(sessionCollectedUnits * massPerUnit),
      collectionProgressPct: Math.max(0, Math.min(100, Math.round(collectionProgressPct))),
      remainingAlgae: Math.round(algaeCurrent),
      wasteFull,
      massPerUnit,
    };
  }, [collectedAlgae, basketAtStart, algaeInitial, algaeCurrent, ultrasonicOn, paused]);

  // Evaluate water quality against the active (user-configurable) thresholds.
  // A failed sensor reads as Unknown and is excluded from the water-quality
  // verdict, but it is never counted as healthy.
  const { statuses, overall } = useMemo(
    () => evaluate(readings, thresholds),
    [readings, thresholds],
  );

  const wqi = useMemo(() => calculateWQI(readings, statuses), [readings, statuses]);
  const treatment = useMemo(() => treatmentState(engine, overall, statuses), [engine, overall, statuses]);
  const robot = useMemo(() => robotState(engine, diagnosticOverride), [engine, diagnosticOverride]);
  const progress = useMemo(() => phaseProgress(engine), [engine]);
  // Which of the four cycle stages is current. After a treatment completes the
  // water stays "improved" (stage 4) until a new event is allowed to begin.
  const stage = useMemo(() => {
    if (engine.phase === PHASE.TREATING) return 3;
    if (engine.phase === PHASE.DEGRADING) return 2;
    if (engine.recovered) return 4;
    return 1;
  }, [engine]);

  const value = useMemo(
    () => ({
      readings,
      statuses,
      operating,
      sensorMessages,
      getLastValid,
      faultySensors,
      isFaulty,
      failSensor,
      restoreSensor,
      clearSensorFaults,
      mode,
      setMode,
      ultrasonicOn,
      setUltrasonic,
      toggleUltrasonic,
      treatmentStatus,
      collectionStatus,
      emptyBasket,
      algaeInitial,
      algaeCurrent,
      SENSOR_STATUS,
      FAULT_MESSAGE,
      overall,
      wqi,
      history: history || emptyHistory(),
      initialized: history !== null,
      connectionStatus: iotStatus,
      iotSourceUrl: IOT_SOURCE_URL,
      iotLastUpdated,
      params: PARAM_KEYS,
      phase: engine.phase,
      contamination: engine.contamination,
      peak: engine.peak,
      progress,
      stage,
      treatmentCycles: engine.events,
      severeEvents: engine.severeEvents || 0,
      lastTreatment: engine.lastTreatment,
      treatment,
      robot,
      paused,
      setPaused,
      triggerEvent,
      forcePhase,
      thresholds,
      updateThresholdBand,
      updateGoodThreshold,
      resetThresholds,
      diagnosticOverride,
      setDiagnosticOverride,
      clearedAlerts,
      dismissAlert,
      clearAllAlerts,
      restoreAlerts,
    }),
    [
      readings,
      statuses,
      operating,
      sensorMessages,
      getLastValid,
      faultySensors,
      isFaulty,
      failSensor,
      restoreSensor,
      clearSensorFaults,
      mode,
      setMode,
      ultrasonicOn,
      setUltrasonic,
      toggleUltrasonic,
      treatmentStatus,
      collectionStatus,
      emptyBasket,
      algaeInitial,
      algaeCurrent,
      overall,
      wqi,
      history,
      iotStatus,
      iotLastUpdated,
      engine,
      progress,
      stage,
      treatment,
      robot,
      paused,
      thresholds,
      diagnosticOverride,
      clearedAlerts,
      forcePhase,
    ]
  );

  return <SensorContext.Provider value={value}>{children}</SensorContext.Provider>;
}

export function useSensors() {
  const ctx = useContext(SensorContext);
  if (!ctx) throw new Error('useSensors must be used within SensorProvider');
  return ctx;
}
