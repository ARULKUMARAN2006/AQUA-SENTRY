import { DEFAULT_THRESHOLDS } from '../data/thresholds';
import { classify } from './quality';

// Hard cap on the alert pool so counters stay meaningful: only the most recent
// breaches are retained. The Alerts page then renders at most 10 of these.
export const MAX_TOTAL_ALERTS = 50;

// Build sensor alerts from history points whose status is Moderate, Poor or Critical.
// One alert per parameter per severity per hour keeps the list readable.
export function buildAlerts(history, thresholds = DEFAULT_THRESHOLDS, max = MAX_TOTAL_ALERTS) {
  const alerts = [];
  const sensorName = {
    ph: 'pH Sensor',
    turbidity: 'Turbidity Sensor',
    temperature: 'Temperature Sensor',
    tds: 'TDS Sensor',
    do: 'Dissolved Oxygen Sensor',
    optical: 'Optical Underwater Sensor',
  };

  const activeThresholds = thresholds || DEFAULT_THRESHOLDS;
  const seen = new Set();

  Object.keys(sensorName).forEach((key) => {
    const series = history[key] || [];
    series.forEach((p) => {
      const c = classify(key, p.value, activeThresholds);
      if (c.status === 'Good' || c.status === 'Unknown') return;
      const bucket = Math.floor(p.time / (60 * 60 * 1000));
      const id = `${key}-${c.status}-${bucket}`;
      if (seen.has(id)) return;
      seen.add(id);
      alerts.push({
        id,
        kind: 'sensor',
        time: p.time,
        value: p.value,
        unit: activeThresholds[key]?.unit || '',
        parameter: activeThresholds[key]?.label || key,
        sensor: sensorName[key],
        status: c.status,
        message: messageFor(key, p.value, c.status, activeThresholds),
      });
    });
  });

  // Newest first, then trimmed to the cap.
  alerts.sort((a, b) => b.time - a.time);
  return Number.isFinite(max) && max > 0 ? alerts.slice(0, max) : alerts;
}

function messageFor(key, value, status, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds[key] || DEFAULT_THRESHOLDS[key];
  const good = t.bands[0];
  if (status === 'Moderate') {
    return `${t.label} reading of ${value} ${t.unit} is outside the optimal good range (${good.min}–${good.max} ${t.unit}).`;
  }
  if (status === 'Poor') {
    return `${t.label} reading of ${value} ${t.unit} exceeded the poor limit. Edge revitalization standby.`;
  }
  return `${t.label} reading of ${value} ${t.unit} breached critical edge safety limits. Automated mitigation required.`;
}
