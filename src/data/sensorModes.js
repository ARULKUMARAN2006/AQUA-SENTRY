import { DEFAULT_THRESHOLDS } from './thresholds';
import { classify } from '../utils/quality';

/**
 * Sensor operating modes and per-sensor failure model for the 3D pond.
 *
 * Readings are PINNED per mode (with a small live jitter so they still move
 * over time) rather than emergent, so the operator always sees the documented
 * demonstration values. These are illustrative simulation values only — they
 * are not measurements and not universal water-quality standards.
 */

export const SENSOR_ORDER = ['ph', 'turbidity', 'temperature', 'tds', 'do', 'optical'];

/** Status vocabulary used by the sensor cards and the 3D indicators. */
export const SENSOR_STATUS = {
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
  FAULT: 'FAULT',
  UNKNOWN: 'UNKNOWN',
};

export const STATUS_COLOR = {
  NORMAL: '#22c55e',
  WARNING: '#eab308',
  CRITICAL: '#f97316',
  FAULT: '#ef4444',
  UNKNOWN: '#94a3b8',
};

export const FAULT_MESSAGE = 'Sensor disconnected or malfunctioning (simulated)';

// Illustrative demonstration values.
export const SENSOR_MODES = {
  normal: {
    id: 'normal',
    label: 'NORMAL READINGS',
    short: 'Normal',
    description: 'Healthy pond water. Every sensor is online and reporting in range.',
    values: { ph: 7.2, turbidity: 3.0, temperature: 27, tds: 280, do: 6.5, optical: 88 },
    // Small movement keeps the reading alive without leaving the band.
    jitter: { ph: 0.04, turbidity: 0.15, temperature: 0.15, tds: 6, do: 0.06, optical: 1 },
  },
  abnormal: {
    id: 'abnormal',
    label: 'ABNORMAL READINGS',
    short: 'Abnormal',
    description: 'Degraded water body. Sensors still work — the water is the problem.',
    values: { ph: 9.2, turbidity: 35, temperature: 34, tds: 950, do: 2.5, optical: 16 },
    jitter: { ph: 0.09, turbidity: 1.1, temperature: 0.3, tds: 22, do: 0.12, optical: 2 },
  },
};

export const MODE_LIST = [SENSOR_MODES.normal, SENSOR_MODES.abnormal];

const DECIMALS = { ph: 2, turbidity: 1, temperature: 1, tds: 0, do: 1, optical: 0 };

/** Next live sample for a sensor in the given mode. */
export function nextReading(key, modeId, prev) {
  const mode = SENSOR_MODES[modeId] || SENSOR_MODES.normal;
  const base = mode.values[key];
  if (base == null) return null;
  const amp = mode.jitter[key] ?? 0.1;
  const drift = Math.random() * 2 - 1;
  const ease = prev == null ? 0 : (base - prev) * 0.25;
  let v = (prev == null ? base : prev) + drift * amp + ease;
  v = Math.max(0, v);
  return +v.toFixed(DECIMALS[key] ?? 2);
}

/** Build a backfill series that sits around the active mode's values. */
export function generateSensorHistory(modeId, hours = 168, intervalMin = 10) {
  const mode = SENSOR_MODES[modeId] || SENSOR_MODES.normal;
  const total = Math.max(2, Math.floor((hours * 60) / intervalMin));
  const now = Date.now();
  const history = {};
  SENSOR_ORDER.forEach((k) => { history[k] = []; });

  for (let i = total; i >= 0; i--) {
    const t = now - i * intervalMin * 60 * 1000;
    SENSOR_ORDER.forEach((k, idx) => {
      const base = mode.values[k];
      const amp = (mode.jitter[k] ?? 0.1) * 2.2;
      const wave = Math.sin((i / 11) + idx * 1.6) * amp + Math.sin((i / 3.5) + idx) * amp * 0.35;
      let v = Math.max(0, base + wave + (Math.random() - 0.5) * amp);
      history[k].push({ time: t, value: +v.toFixed(DECIMALS[k] ?? 2) });
    });
  }

  return history;
}

/**
 * Status of a single sensor.
 * A fault is a hardware problem, not a water-quality verdict, so a working
 * sensor measuring poor water reports WARNING / CRITICAL, never FAULT.
 */
export function sensorStatus(key, value, faulty = false) {
  if (faulty) return SENSOR_STATUS.FAULT;
  if (value == null || Number.isNaN(value)) return SENSOR_STATUS.UNKNOWN;
  const band = classify(key, value, DEFAULT_THRESHOLDS).status;
  if (band === 'Good') return SENSOR_STATUS.NORMAL;
  if (band === 'Moderate') return SENSOR_STATUS.WARNING;
  return SENSOR_STATUS.CRITICAL; // Poor and Critical
}

export function statusColor(status) {
  return STATUS_COLOR[status] || STATUS_COLOR.UNKNOWN;
}

/** Short explanation shown on the sensor cards. */
export function explainStatus(key, value, status) {
  const unit = DEFAULT_THRESHOLDS[key]?.unit || '';
  const good = DEFAULT_THRESHOLDS[key]?.bands?.[0];

  if (status === SENSOR_STATUS.FAULT) return FAULT_MESSAGE;
  if (status === SENSOR_STATUS.UNKNOWN) return 'No valid reading from this sensor (demo).';

  const reading = `${value}${unit ? ` ${unit}` : ''}`;
  if (status === SENSOR_STATUS.NORMAL) {
    return `Reading ${reading} is inside the configured good range (${good.min}–${good.max} ${good.unit}).`;
  }
  if (status === SENSOR_STATUS.WARNING) {
    return `Reading ${reading} is outside the good range (${good.min}–${good.max} ${good.unit}). The sensor is working; the water is drifting out of range.`;
  }
  return `Reading ${reading} is far outside the configured range (${good.min}–${good.max} ${good.unit}). The sensor is working; remediation is required.`;
}

export const SENSOR_META = {
  ph: { label: 'pH', short: 'pH' },
  turbidity: { label: 'Turbidity', short: 'TURB' },
  temperature: { label: 'Temperature', short: 'TEMP' },
  tds: { label: 'TDS', short: 'TDS' },
  do: { label: 'Dissolved Oxygen', short: 'DO' },
  optical: { label: 'Optical Underwater', short: 'OPT' },
};
