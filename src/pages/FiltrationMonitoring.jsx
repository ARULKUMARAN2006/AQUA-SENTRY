import React, { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import { useSensors } from '../context/SensorContext';
import { FILTRATION } from '../data/filtrationModel';
import { SENSOR_META } from '../data/sensorModes';

const fmt = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Filtration Monitoring — live view of the simulated filtration loop.
 *
 * Every number is derived from the running simulation state and the configured
 * filter model; nothing here is hard-coded telemetry.
 */
export default function FiltrationMonitoring({ onMenuToggle, onOpenThresholds }) {
  const { readings, statuses, phase, treatment, history, initialized, connectionStatus } = useSensors();

  // Filtration efficiency falls as the media loads up, exactly as the machine model does.
  const saturation = useMemo(() => {
    // Media loading is driven by how long the system has been in a dirty state.
    if (phase === 'Ultrasonic treatment') return Math.min(1, 0.35 + (1 - (readings.turbidity ?? 3) / 30) * 0.3);
    if ((readings.turbidity ?? 3) > 10) return Math.min(1, 0.3 + (readings.turbidity - 10) / 40);
    return Math.max(0.05, (readings.turbidity ?? 3) / 30 * 0.5);
  }, [phase, readings.turbidity]);

  const efficiency = FILTRATION.efficiencyMax * (1 - FILTRATION.efficiencyLoss * saturation);
  const pumpOn = treatment.state !== 'Inactive' || phase !== 'Monitoring';
  const flow = pumpOn ? 1 : 0;

  const intake = readings.turbidity ?? 0;
  const outlet = +(intake * (1 - efficiency)).toFixed(2);
  const removal = intake > 0 ? +(((intake - outlet) / intake) * 100).toFixed(1) : 0;

  const comparison = useMemo(() => {
    const rows = ['turbidity', 'optical', 'tds', 'do'].map((key) => {
      const v = readings[key] ?? 0;
      const after = key === 'turbidity' ? v * (1 - efficiency)
        : key === 'optical' ? Math.min(100, v * (1 + efficiency * 0.35))
          : v * (1 - efficiency * 0.45);
      return {
        key,
        label: SENSOR_META[key].label,
        unit: SENSOR_META[key].short,
        before: +v.toFixed(2),
        after: +after.toFixed(2),
      };
    });
    return rows;
  }, [readings, efficiency]);

  const turbiditySeries = useMemo(() => {
    if (!initialized) return [];
    const series = (history.turbidity || []).slice(-120);
    return series.map((p) => ({ ts: p.time, value: p.value, t: fmt(p.time) }));
  }, [history, initialized]);

  return (
    <div className="page">
      <Header
        title="Filtration Monitoring"
        subtitle="Intake, filter media loading and outlet quality"
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />

      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Pump / Flow</span></div>
          <div className="stat-value" style={{ fontSize: 20 }}><StatusBadge status={pumpOn ? 'Active' : 'Inactive'} /></div>
          <div className="stat-note">Simulated flow {(flow * FILTRATION.flowMax * 100).toFixed(0)}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Media loading</span></div>
          <div className="stat-value">{(saturation * 100).toFixed(0)}%</div>
          <div className="stat-note">Filter capacity {(FILTRATION.mediaCapacity)} units</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Removal efficiency</span></div>
          <div className="stat-value">{(efficiency * 100).toFixed(1)}%</div>
          <div className="stat-note">Degrades as media saturates</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Treatment state</span></div>
          <div className="stat-value" style={{ fontSize: 20 }}><StatusBadge status={treatment.state} /></div>
          <div className="stat-note">{treatment.reason}</div>
        </div>
      </div>

      <div className="cards-grid" style={{ marginTop: 16 }}>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Intake turbidity</span></div>
          <div className="stat-value">{intake}<span className="stat-unit">NTU</span></div>
          <div className="stat-footer"><StatusBadge status={statuses.turbidity} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Outlet turbidity</span></div>
          <div className="stat-value">{outlet}<span className="stat-unit">NTU</span></div>
          <div className="stat-footer"><span className="stat-note">{removal}% removed</span></div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Intake vs outlet (simulated model)</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Parameter</th><th>Intake</th><th>Outlet</th><th>Change</th></tr></thead>
            <tbody>
              {comparison.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td>{r.before}</td>
                  <td>{r.after}</td>
                  <td className={(r.after - r.before) <= 0 ? 'good-txt' : 'bad-txt'}>
                    {(r.after - r.before) > 0 ? '+' : ''}{(r.after - r.before).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Turbidity through the filter (last ~30 samples)</h2>
        {!initialized ? (
          <div className="loading"><div className="spinner" /><p>Loading…</p></div>
        ) : (
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={turbiditySeries}>
                <defs>
                  <linearGradient id="turbGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={5} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'good max', fontSize: 10, fill: '#16a34a' }} />
                <Area type="monotone" dataKey="value" name="Turbidity (NTU)" stroke="#f59e0b" fill="url(#turbGrad)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
