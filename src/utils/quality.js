import { DEFAULT_THRESHOLDS, STATUS_SEVERITY, STATUS_COLOR_BY_NAME } from '../data/thresholds';

export function classify(key, value, thresholds = DEFAULT_THRESHOLDS) {
  const t = (thresholds && thresholds[key]) || DEFAULT_THRESHOLDS[key];
  if (!t || value == null || Number.isNaN(value)) return { status: 'Unknown', color: '#94a3b8' };
  for (const band of t.bands) {
    if (value >= band.min && value <= band.max) {
      return {
        status: band.status,
        color:
          band.color === 'green'
            ? '#22c55e'
            : band.color === 'yellow'
            ? '#eab308'
            : band.color === 'orange'
            ? '#f97316'
            : '#ef4444',
      };
    }
  }
  return { status: 'Critical', color: '#ef4444' };
}

export function classifyNamed(status) {
  return STATUS_COLOR_BY_NAME[status] || '#94a3b8';
}

export function overallStatus(statuses) {
  const values = Object.values(statuses);
  if (values.length === 0 || values.every((s) => s === 'Unknown')) return 'Unknown';

  let max = -1;
  let worst = 'Good';
  values.forEach((s) => {
    if (s === 'Unknown') return;
    const sev = STATUS_SEVERITY[s] ?? 0;
    if (sev > max) {
      max = sev;
      worst = s;
    }
  });
  return worst;
}

export const THRESHOLD_LABEL = (key, thresholds = DEFAULT_THRESHOLDS) => {
  const t = (thresholds && thresholds[key]) || DEFAULT_THRESHOLDS[key];
  if (!t) return '';
  const good = t.bands[0];
  return `Good: ${good.min}–${good.max} ${t.unit}`.trim();
};

/**
 * Calculates a weighted Water Quality Index (0 - 100)
 * 100 = Pristine equilibrium, < 50 = Critical degradation
 */
export function calculateWQI(readings, statuses) {
  if (!readings) return 0;
  const weights = { ph: 0.2, turbidity: 0.2, temperature: 0.1, tds: 0.15, do: 0.2, optical: 0.15 };
  const scoreMap = { Good: 95, Moderate: 72, Poor: 45, Critical: 20, Unknown: 50 };

  let totalScore = 0;
  let totalWeight = 0;

  Object.keys(weights).forEach((k) => {
    const s = statuses[k] || 'Unknown';
    const score = scoreMap[s] ?? 50;
    totalScore += score * weights[k];
    totalWeight += weights[k];
  });

  return Math.round(totalScore / totalWeight);
}
