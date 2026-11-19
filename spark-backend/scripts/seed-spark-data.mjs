// Generates a realistic sensor_readings.jsonl for the Spark job.
// Mirrors what the dashboard posts to /api/ingest, so the pipeline can be
// demonstrated end-to-end without a browser.
//
// Usage: node scripts/seed-spark-data.mjs [hours] [outFile]
import fs from 'node:fs';
import path from 'node:path';

const hours = Number(process.argv[2] || 168);
const outFile = path.resolve(process.argv[3] || 'data/sensor_readings.jsonl');

const SENSORS = [
  { key: 'ph', unit: '', base: 7.2, amp: 0.12, lo: 4.0, hi: 10.0 },
  { key: 'turbidity', unit: 'NTU', base: 3.0, amp: 1.1, lo: 0.5, hi: 45 },
  { key: 'temperature', unit: '°C', base: 27, amp: 0.9, lo: 12, hi: 36 },
  { key: 'tds', unit: 'ppm', base: 280, amp: 18, lo: 120, hi: 1200 },
  { key: 'do', unit: 'mg/L', base: 6.5, amp: 0.5, lo: 1.2, hi: 12 },
  { key: 'optical', unit: '%', base: 88, amp: 3, lo: 8, hi: 100 },
];

// A contamination event roughly every 18h: readings degrade, then the
// ultrasonic filtration brings them back.
const EVENT_PERIOD_H = 18;
const FILTER_EFFICIENCY = 0.62;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function levelAt(hoursAgo) {
  const phase = (hoursAgo % EVENT_PERIOD_H) / EVENT_PERIOD_H;
  if (phase < 0.35) return 0;                       // clean
  if (phase < 0.5) return (phase - 0.35) / 0.15;    // degrading
  if (phase < 0.8) return 1 - (phase - 0.5) / 0.3;  // treating
  return 0;
}

const lines = [];
const stepMin = 10;
const now = Date.now();

for (let t = hours * 60; t >= 0; t -= stepMin) {
  const ts = now - t * 60 * 1000;
  const level = levelAt(t / 60);
  const mode = level > 0.35 ? 'abnormal' : 'normal';
  const wave = Math.sin(t / 26) * 0.35;

  for (const s of SENSORS) {
    // Degradation pushes values away from the clean baseline.
    const degraded = s.key === 'optical'
      ? s.base * (1 - 0.78 * level)
      : s.key === 'do'
        ? s.base * (1 - 0.60 * level)
        : s.key === 'ph'
          ? s.base + 2.0 * level
          : s.key === 'temperature'
            ? s.base + 7.0 * level   // additive: a pond does not double in temperature
            : s.base * (1 + level);

    const noise = (Math.random() - 0.5) * 2 * s.amp * (0.4 + level);
    let v = degraded + noise + s.base * wave * 0.02;
    v = clamp(v, s.lo, s.hi);

    // Intake sample (what the lake / intake port sees)
    lines.push(JSON.stringify({
      ts, sensor: s.key, value: +v.toFixed(3), unit: s.unit, stage: 'intake', mode,
    }));

    // Outlet sample after the ultrasonic filter stage
    const out = s.key === 'optical'
      ? clamp(v * (1 + FILTER_EFFICIENCY * 0.35), 0, 100)
      : clamp(v * (1 - FILTER_EFFICIENCY * 0.55), 0, 100000);
    lines.push(JSON.stringify({
      ts, sensor: s.key, value: +out.toFixed(3), unit: s.unit, stage: 'outlet', mode,
    }));
  }
}

// A few invalid rows so the Spark cleaning step has something to reject.
lines.push(JSON.stringify({ ts: now - 5000, sensor: 'ph', value: null, unit: '', stage: 'intake', mode: 'normal' }));
lines.push(JSON.stringify({ ts: now - 4000, sensor: 'bogus', value: 12, unit: '', stage: 'intake', mode: 'normal' }));
lines.push(JSON.stringify({ ts: now - 3000, sensor: 'ph', value: 99, unit: '', stage: 'intake', mode: 'normal' }));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} rows to ${outFile}`);
