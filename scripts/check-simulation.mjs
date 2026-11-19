// Sanity check of the simulation engine, loaded through Vite's SSR resolver.
// Usage: node scripts/check-simulation.mjs
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const sim = await server.ssrLoadModule('/src/data/simulation.js');

const { createEngine, step, generateHistory, evaluate, PARAM_KEYS } = sim;

const now = Date.now();
let e = createEngine();
const phases = {};
const transitions = [];
let prevPhase = e.phase;
let cycles = 0;

for (let i = 0; i < 4000; i++) {
  const r = step(e, now + i * 3000);
  e = r.engine;
  phases[e.phase] = (phases[e.phase] || 0) + 1;
  if (e.phase !== prevPhase) {
    transitions.push(`t${i}: ${prevPhase}->${e.phase}`);
    prevPhase = e.phase;
  }
  if (e.lastTreatment && e.events > cycles) {
    cycles = e.events;
    const b = e.lastTreatment.before;
    const a = e.lastTreatment.after;
    console.log(`cycle ${cycles} @tick ${i}: turb ${b.turbidity}->${a.turbidity} | tds ${b.tds}->${a.tds} | ph ${b.ph}->${a.ph} | temp ${b.temperature}->${a.temperature}`);
  }
}

const { history, engine, values } = generateHistory(168, 10);
const ev = evaluate(values);

console.log('\n--- history ---');
console.log('points per series:', history.ph.length);
console.log('engine phase after history:', engine.phase, '| cycles:', engine.events);
console.log('current values:', JSON.stringify(values));
console.log('statuses:', JSON.stringify(ev.statuses), '| overall:', ev.overall);

const stats = {};
PARAM_KEYS.forEach((k) => {
  const vs = history[k].map((p) => p.value);
  stats[k] = { min: Math.min(...vs), max: Math.max(...vs), last: vs[vs.length - 1] };
});
console.log('series stats:', JSON.stringify(stats));
console.log('phase distribution over 4000 ticks:', phases);
console.log('first transitions:', transitions.slice(0, 10).join(' | '));

await server.close();
