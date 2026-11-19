// ---------------------------------------------------------------------------
// Simulation engine (frontend demo only - no hardware).
//
// Models the real operating cycle of the system:
//   1. Robot deployed / patrolling, sensors monitor water quality
//   2. A contamination event develops (algae / runoff)
//   3. ESP32 edge logic compares readings against thresholds, detects a breach
//   4. Ultrasonic treatment is activated
//   5. Water quality recovers toward the normal range
//   6. Treatment stops and monitoring resumes
//
// Every number here is generated in the browser. Nothing is measured and
// nothing controls real hardware.
// ---------------------------------------------------------------------------

import { classify, overallStatus } from '../utils/quality';

export const PARAM_KEYS = ['ph', 'turbidity', 'temperature', 'tds', 'do', 'optical'];

export const UNITS = {
  ph: '',
  turbidity: 'NTU',
  temperature: '°C',
  tds: 'ppm',
  do: 'mg/L',
  optical: '%',
};

export const LABELS = {
  ph: 'pH',
  turbidity: 'Turbidity',
  temperature: 'Temperature',
  tds: 'TDS',
  do: 'Dissolved Oxygen',
  optical: 'Optical Underwater',
};

// Water condition at the two ends of the cycle.
// DO falls with organic / algal load; optical transmission falls as the water
// becomes more turbid, so both are physically coupled to the contamination level.
const NORMAL = { ph: 7.4, turbidity: 3.2, temperature: 24.6, tds: 240, do: 8.4, optical: 91 };
const CONTAMINATED = { ph: 8.6, turbidity: 18, temperature: 31, tds: 620, do: 3.4, optical: 26 };

export const PHASE = {
  MONITORING: 'Monitoring',
  DEGRADING: 'Degradation detected',
  TREATING: 'Ultrasonic treatment',
};

export const PHASE_COPY = {
  [PHASE.MONITORING]: 'Robot is patrolling. Sensors are monitoring water quality.',
  [PHASE.DEGRADING]: 'Water quality is degrading. Thresholds are being watched.',
  [PHASE.TREATING]: 'Treatment is running to restore water quality.',
};

const RISE = 0.06;          // contamination growth per tick
const FALL = 0.05;          // recovery per tick while the ultrasonic unit runs
export const PEAK_MIN = 0.7; // routine event develops this far
const PEAK_MAX = 2.4;       // severe events overshoot far beyond it
const SEVERE_CHANCE = 0.28; // chance an event escalates to a severe one
const EVENT_START_P = 0.012; // chance per tick that a new event begins
const TRIGGER_NORMAL = 0.6; // fraction of peak where routine treatment starts
const TRIGGER_SEVERE = 0.85; // severe events are allowed to climb further first
const TREAT_HOLD = 8;       // minimum ticks treatment stays active
const REPEAT_EVENT = 20;    // ticks of calm before another event may start
export { REPEAT_EVENT };

// Algae concentration model (simulation only — illustrative values, not a
// physical model and not a claim about real-world treatment effectiveness).
export const ALGAE_MODEL = {
  INITIAL: 100,            // starting algae concentration (arbitrary units)
  GROWTH_PER_TICK: 5,      // concentration increase per 3s tick during contamination
  REDUCTION_PER_TICK: 8,   // concentration decrease per 3s tick during treatment
  MIN: 0,                  // minimum concentration
  MAX: 500,                // maximum concentration
};

// Algae collection stage (simulation only).
//
// This is a *separate physical capture step* after ultrasonic stimulation and
// filtration. It does not imply that ultrasound removes biomass by itself.
// `MASS_MG_PER_UNIT` is an illustrative conversion for the demo; it is not a
// measured mass balance.
export const ALGAE_COLLECTION = {
  MASS_MG_PER_UNIT: 10,       // simulated captured mass per concentration unit
  BASKET_CAPACITY_UNITS: 100, // basket capacity (100 units = 1000 mg simulated)
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const isBreach = (overall) => overall === 'Poor' || overall === 'Critical';

export function createEngine(overrides = {}) {
  return {
    tick: 0,
    phase: PHASE.MONITORING,
    contamination: 0,
    peak: PEAK_MIN,
    eventTicks: 0,
    treatTicks: 0,
    quietTicks: 0,
    events: 0,
    severeEvents: 0,
    recovered: false,
    lastTreatment: null,
    ...overrides,
  };
}

// Values for a contamination level (0 = normal, peak = fully contaminated).
// Exported so the dashboard can blend its live readings toward the same
// contaminated values the phase machine uses — the panel and the engine must
// never disagree about how dirty the water is.
export function contaminationValues(contamination, tick = 0) {
  const level = clamp(contamination, 0, PEAK_MAX);
  const out = {};

  PARAM_KEYS.forEach((k, i) => {
    const clean = NORMAL[k];
    const dirty = CONTAMINATED[k];
    const mid = clean + (dirty - clean) * level;

    const wave = Math.sin((tick + i * 9) / 14) * 0.4 + Math.sin((tick + i * 3) / 5) * 0.2;
    const jitter = (Math.random() - 0.5) * 0.9;
    let v = mid + (wave + jitter) * (0.35 + 0.65 * level);

    if (k === 'ph') v = clamp(v, 3.5, 10.5);
    if (k === 'turbidity') v = clamp(v, 0, 90);
    if (k === 'temperature') v = clamp(v, 8, 42);
    if (k === 'tds') v = clamp(v, 0, 2200);
    if (k === 'do') v = clamp(v, 0.4, 16);
    if (k === 'optical') v = clamp(v, 3, 100);

    out[k] = (k === 'tds' || k === 'optical') ? Math.round(v) : +v.toFixed(2);
  });

  return out;
}

export function evaluate(values, thresholds) {
  const statuses = {};
  PARAM_KEYS.forEach((k) => { statuses[k] = classify(k, values?.[k], thresholds).status; });
  return { statuses, overall: overallStatus(statuses) };
}

function beginEvent(s) {
  const severe = Math.random() < SEVERE_CHANCE;
  s.phase = PHASE.DEGRADING;
  s.eventTicks = 0;
  s.severe = severe;
  s.recovered = false;
  s.peak = severe ? PEAK_MIN + (PEAK_MAX - PEAK_MIN) * (0.55 + Math.random() * 0.45) : PEAK_MIN;
}

// Advance the engine one tick. Returns { engine, values }.
export function step(engine, timeMs) {
  const s = { ...engine, tick: engine.tick + 1 };
  let values = contaminationValues(s.contamination, s.tick);

  if (s.phase === PHASE.MONITORING) {
    s.contamination = Math.max(0, s.contamination - 0.04);
    s.quietTicks += 1;
    // The "water improved" stage lasts for a calm window, then normal
    // monitoring resumes and another event may begin.
    if (s.recovered && s.quietTicks > REPEAT_EVENT) s.recovered = false;
    if (s.quietTicks > REPEAT_EVENT && Math.random() < EVENT_START_P) beginEvent(s);
  } else if (s.phase === PHASE.DEGRADING) {
    s.eventTicks += 1;
    s.contamination = Math.min(s.peak, s.contamination + RISE * (0.7 + Math.random() * 0.6));
    values = contaminationValues(s.contamination, s.tick);

    const ready = s.contamination >= s.peak * (s.severe ? TRIGGER_SEVERE : TRIGGER_NORMAL) && s.eventTicks > 5;
    if (ready && isBreach(evaluate(values).overall)) {
      s.phase = PHASE.TREATING;
      s.treatTicks = 0;
      s.recovered = false;
      s.before = values;
      s.beforeStatuses = evaluate(values).statuses;
      s.treatmentStartedAt = timeMs;
      s.treatmentSevere = !!s.severe;
    }
  } else if (s.phase === PHASE.TREATING) {
    s.treatTicks += 1;
    s.contamination = Math.max(0, s.contamination - FALL * (0.8 + Math.random() * 0.4));
    values = contaminationValues(s.contamination, s.tick);

    if (s.contamination <= 0.03 && s.treatTicks > TREAT_HOLD) {
      s.phase = PHASE.MONITORING;
      s.quietTicks = 0;
      s.recovered = true;
      s.events += 1;
      if (s.severe) s.severeEvents += 1;
      s.lastTreatment = {
        startedAt: s.treatmentStartedAt,
        endedAt: timeMs,
        durationTicks: s.treatTicks,
        before: s.before,
        after: values,
        beforeOverall: worstOf(s.before),
        afterOverall: worstOf(values),
        severe: !!s.severe,
      };
    }
  }

  return { engine: s, values };
}

function worstOf(values) {
  if (!values) return 'Unknown';
  return evaluate(values).overall;
}

// --- Derived system state (used by the UI) -------------------------------

export function treatmentState(engine, overall, statuses) {
  const offline = PARAM_KEYS.filter((k) => statuses[k] === 'Unknown');

  if (offline.length) {
    return {
      state: 'Standby',
      reason: `No reading available for ${offline.map((k) => LABELS[k]).join(', ')}. Ultrasonic treatment is held in standby until every required reading is valid.`,
    };
  }
  if (engine.phase === PHASE.TREATING) {
    return {
      state: 'Active',
      reason: `Water quality reached ${overall}, which exceeded the configured limit. The ESP32 edge controller activated the ultrasonic treatment to reduce algae and suspended solids.`,
    };
  }
  if (engine.phase === PHASE.DEGRADING) {
    return {
      state: 'Standby',
      reason: `A contamination event is developing (water quality ${overall}). Treatment is armed and will activate automatically as soon as the reading crosses the poor threshold.`,
    };
  }
  if (overall === 'Moderate') {
    return {
      state: 'Standby',
      reason: 'One or more parameters are outside the good range but within moderate limits. The system is monitoring and will activate treatment if the reading worsens.',
    };
  }
  return {
    state: 'Inactive',
    reason: 'All monitored parameters are inside configured good ranges, so ultrasonic treatment is not required and stays off.',
  };
}

export function robotState(engine, diagnosticOverride = null) {
  const treating = engine.phase === PHASE.TREATING;

  let thrusters = treating
    ? {
      'Front Left Thruster': 'Active',
      'Front Right Thruster': 'Active',
      'Rear Left Thruster': 'Inactive',
      'Rear Right Thruster': 'Inactive',
    }
    : {
      'Front Left Thruster': 'Active',
      'Front Right Thruster': 'Active',
      'Rear Left Thruster': 'Active',
      'Rear Right Thruster': 'Active',
    };

  if (diagnosticOverride && typeof diagnosticOverride === 'object') {
    thrusters = {
      ...thrusters,
      ...diagnosticOverride,
    };
  } else if (diagnosticOverride === 'fault') {
    thrusters = {
      ...thrusters,
      'Rear Right Thruster': 'Fault',
    };
  } else if (diagnosticOverride === 'docked') {
    thrusters = {
      'Front Left Thruster': 'Inactive',
      'Front Right Thruster': 'Inactive',
      'Rear Left Thruster': 'Inactive',
      'Rear Right Thruster': 'Inactive',
    };
  }

  const hasManualFault = Object.values(thrusters).some((status) => status === 'Fault');
  const allInactive = Object.values(thrusters).every((status) => status === 'Inactive');
  const mode = allInactive
    ? 'Stationary Docked'
    : hasManualFault
    ? 'Diagnostic Fail-Safe'
    : treating
    ? 'Treatment Hold (Cavitation Field)'
    : engine.phase === PHASE.DEGRADING
    ? 'Navigate to Site'
    : 'Autonomous Edge Patrol';

  const telemetry = {
    'Front Left Thruster': {
      status: thrusters['Front Left Thruster'],
      pwm: thrusters['Front Left Thruster'] === 'Active' ? 68 : 0,
      rpm: thrusters['Front Left Thruster'] === 'Active' ? 1420 : 0,
      current: thrusters['Front Left Thruster'] === 'Active' ? '2.1 A' : '0.0 A',
    },
    'Front Right Thruster': {
      status: thrusters['Front Right Thruster'],
      pwm: thrusters['Front Right Thruster'] === 'Active' ? 68 : 0,
      rpm: thrusters['Front Right Thruster'] === 'Active' ? 1420 : 0,
      current: thrusters['Front Right Thruster'] === 'Active' ? '2.1 A' : '0.0 A',
    },
    'Rear Left Thruster': {
      status: thrusters['Rear Left Thruster'],
      pwm: thrusters['Rear Left Thruster'] === 'Active' ? 62 : 0,
      rpm: thrusters['Rear Left Thruster'] === 'Active' ? 1310 : 0,
      current: thrusters['Rear Left Thruster'] === 'Active' ? '1.9 A' : '0.0 A',
    },
    'Rear Right Thruster': {
      status: thrusters['Rear Right Thruster'],
      pwm: thrusters['Rear Right Thruster'] === 'Active' ? 62 : 0,
      rpm: thrusters['Rear Right Thruster'] === 'Fault' ? 0 : thrusters['Rear Right Thruster'] === 'Active' ? 1310 : 0,
      current: thrusters['Rear Right Thruster'] === 'Fault' ? '6.8 A (Overcurrent)' : thrusters['Rear Right Thruster'] === 'Active' ? '1.9 A' : '0.0 A',
    },
  };

  return { thrusters, mode, telemetry };
}

export function phaseProgress(engine) {
  if (engine.phase === PHASE.MONITORING) return Math.min(1, engine.quietTicks / REPEAT_EVENT);
  if (engine.phase === PHASE.DEGRADING) return Math.min(1, engine.contamination / engine.peak);
  return 1 - Math.min(1, engine.contamination / engine.peak);
}

export const TICKS_PER_SECOND = 1 / 3; // UI tick is every 3s

// Build history by running the same engine at the given resolution.
export function generateHistory(hours = 168, intervalMin = 10, startEngine = createEngine()) {
  const total = Math.max(2, Math.floor((hours * 60) / intervalMin));
  const now = Date.now();
  const history = {};
  PARAM_KEYS.forEach((k) => { history[k] = []; });

  let engine = startEngine;
  // Warm up so the chart is not always pristine at the left edge.
  for (let i = 0; i < 60; i++) engine = step(engine, now).engine;

  let last = null;
  for (let i = total; i >= 0; i--) {
    const t = now - i * intervalMin * 60 * 1000;
    const res = step(engine, t);
    engine = res.engine;
    last = res.values;
    PARAM_KEYS.forEach((k) => history[k].push({ time: t, value: res.values[k] }));
  }

  return { history, engine, values: last };
}
