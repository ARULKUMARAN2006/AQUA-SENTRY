import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, BarChart, Bar,
} from 'recharts';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import api from '../api/analyticsApi';
import { useSensors } from '../context/SensorContext';
import { SENSOR_ORDER, SENSOR_META, STATUS_COLOR } from '../data/sensorModes';
import { DEFAULT_THRESHOLDS } from '../data/thresholds';

const RANGES = {
  '6h': 6 * 3600e3,
  '24h': 24 * 3600e3,
  '7d': 7 * 24 * 3600e3,
};

const fmtTime = (ts, range) => {
  const d = new Date(ts);
  if (range === '7d') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatReading = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
};

/** Down-sample so the charts stay responsive with long histories. */
function sample(arr, max = 240) {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0);
}

/**
 * Analytics — historical analytics for the Aqua Sentry sensors.
 *
 * Two clearly separated sources:
 *  1. Spark analytics from the backend (authoritative when available)
 *  2. A local fallback computed in the browser from the same simulated history,
 *     always labelled SIMULATED
 */
export default function Analytics({ onMenuToggle, onOpenThresholds }) {
  const { history, statuses, initialized, connectionStatus } = useSensors();

  const [range, setRange] = useState('24h');
  const [selected, setSelected] = useState(SENSOR_ORDER);
  const [backend, setBackend] = useState({ state: 'CHECKING', message: 'Contacting analytics backend…' });
  const [spark, setSpark] = useState(null);
  const [payload, setPayload] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // Poll the backend so a Spark run becomes visible without a manual refresh.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const h = await api.health();
        if (!alive) return;
        setBackend({ state: 'ONLINE', message: 'Analytics backend reachable.' });
        setSpark(h.spark || null);

        const a = await api.analytics();
        if (!alive) return;
        setPayload(a);
        if (a && a.spark) setSpark(a.spark);
        setLoadError(null);
      } catch (e) {
        if (!alive) return;
        setBackend({
          state: 'OFFLINE',
          message: `Analytics backend not reachable at ${api.base}. ${e.message}`,
        });
        setPayload(null);
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const cutoff = Date.now() - RANGES[range];

  // ── Local (simulated) analytics computed from the live history ──────────────
  const local = useMemo(() => {
    if (!initialized) return null;
    const sensors = SENSOR_ORDER.map((key) => {
      const series = sample((history[key] || []).filter((p) => p.time >= cutoff));
      const values = series.map((p) => p.value);
      const d = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return {
        key,
        label: SENSOR_META[key].label,
        unit: DEFAULT_THRESHOLDS[key]?.unit || '',
        avg: d,
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        count: values.length,
        series,
        good: DEFAULT_THRESHOLDS[key]?.bands?.[0],
      };
    });

    const filtration = sensors.map((s) => {
      // Filtration effect estimated from the configured filter efficiency, so the
      // comparison follows the same model the machine uses at runtime.
      const after = s.key === 'turbidity' ? s.avg * 0.35
        : s.key === 'optical' ? Math.min(100, s.avg * 1.35 + 6)
          : s.avg;
      return {
        key: s.key,
        label: s.label,
        unit: s.unit,
        before: +s.avg.toFixed(2),
        after: +after.toFixed(2),
        reduction: s.avg ? +(((s.avg - after) / s.avg) * 100).toFixed(1) : 0,
      };
    });

    return { sensors, filtration, simulated: true };
  }, [history, initialized, cutoff]);

  // ── Spark analytics take precedence when the backend supplies them ──────────
  const sparkSensors = payload?.analytics?.sensors || null;
  const sparkFiltration = payload?.analytics?.filtration || null;

  const sensors = useMemo(() => {
    const sparkBySensor = new Map((sparkSensors || []).map((s) => [s.sensor, s]));
    return SENSOR_ORDER.flatMap((key) => {
      const sparkSensor = sparkBySensor.get(key);
      if (sparkSensor) {
        return [{
          key: sparkSensor.sensor,
          label: sparkSensor.label,
          unit: sparkSensor.unit,
          avg: sparkSensor.avg,
          min: sparkSensor.min,
          max: sparkSensor.max,
          stddev: sparkSensor.stddev,
          count: sparkSensor.count,
          warningCount: sparkSensor.warningCount,
          criticalCount: sparkSensor.criticalCount,
          inRangePct: sparkSensor.inRangePct,
          uptimePct: sparkSensor.uptimePct,
          trend: sparkSensor.trend,
          series: (sparkSensor.series || []).filter((p) => p.ts >= cutoff),
          good: DEFAULT_THRESHOLDS[sparkSensor.sensor]?.bands?.[0],
          source: 'spark',
        }];
      }
      const localSensor = local?.sensors.find((s) => s.key === key);
      return localSensor ? [{ ...localSensor, source: 'local' }] : [];
    });
  }, [sparkSensors, local, cutoff]);

  // Normalise both sources to the same shape: { key, label, before, after }.
  const filtration = useMemo(() => {
    if (sparkFiltration && sparkFiltration.length) {
      return sparkFiltration.map((f) => ({
        key: f.sensor,
        label: f.label,
        unit: f.unit,
        before: f.beforeAvg,
        after: f.afterAvg,
        reductionPct: f.reductionPct,
        samples: f.samples,
        source: 'spark',
      }));
    }
    return (local?.filtration || []).map((f) => ({ ...f, source: 'local' }));
  }, [sparkFiltration, local]);

  const totals = useMemo(() => {
    if (sparkSensors) {
      const t = payload?.analytics?.totals || {};
      return {
        normal: t.normal ?? 0,
        warning: t.warning ?? 0,
        critical: t.critical ?? 0,
        alerts: (t.warning ?? 0) + (t.critical ?? 0),
        source: 'spark',
      };
    }
    let warning = 0;
    let critical = 0;
    Object.keys(statuses).forEach((k) => {
      if (statuses[k] === 'Moderate') warning += 1;
      if (statuses[k] === 'Poor' || statuses[k] === 'Critical') critical += 1;
    });
    return { normal: 0, warning, critical, alerts: warning + critical, source: 'local' };
  }, [sparkSensors, payload, statuses]);

  const usingSpark = sensors.some((s) => s.source === 'spark');
  const visible = sensors.filter((s) => selected.includes(s.key));

  const toggleSensor = (key) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const sparkBadge = () => {
    if (backend.state === 'OFFLINE') return <span className="status-badge red">Backend offline</span>;
    if (!spark) return <span className="status-badge yellow">Checking Spark…</span>;
    if (spark.state === 'READY') return <span className="status-badge green">Spark ready</span>;
    if (spark.state === 'STALE') return <span className="status-badge orange">Spark stale</span>;
    return <span className="status-badge orange">Spark: no result</span>;
  };

  return (
    <div className="page">
      <Header
        title="Analytics"
        subtitle="Historical water-quality analytics"
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
        badge={sparkBadge()}
      />

      {/* Source transparency: never imply Spark ran when it did not. */}
      <div className={`analytics-source ${usingSpark ? 'spark' : 'local'}`}>
        <strong>{usingSpark ? 'Source: Apache Spark (backend)' : 'Source: local browser simulation'}</strong>
        <span>
          {backend.state === 'OFFLINE'
            ? `${backend.message} Showing simulated analytics computed in the browser.`
            : usingSpark
              ? `Spark job output, generated ${spark?.generatedAt ? new Date(spark.generatedAt).toLocaleString() : 'recently'}.`
              : `${spark?.message || 'Spark analytics not available.'} Showing simulated analytics computed in the browser.`}
        </span>
      </div>
      {loadError && <p className="disclaimer">Backend error: {loadError}</p>}

      {/* Summary cards */}
      <div className="cards-grid analytics-cards">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Average</span></div>
          <div className="stat-value">{visible.length ? formatReading(visible[0].avg) : '—'}</div>
          <div className="stat-note">
            {visible.length === 1
              ? `${visible[0].label}${visible[0].unit ? ` (${visible[0].unit})` : ''}`
              : 'Select one sensor'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Maximum</span></div>
          <div className="stat-value">{visible.length ? formatReading(visible[0].max) : '—'}</div>
          <div className="stat-note">{visible.length === 1 ? visible[0].label : 'Select one sensor'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Minimum</span></div>
          <div className="stat-value">{visible.length ? formatReading(visible[0].min) : '—'}</div>
          <div className="stat-note">{visible.length === 1 ? visible[0].label : 'Select one sensor'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Warning events</span><span className="status-dot" style={{ background: STATUS_COLOR.WARNING }} /></div>
          <div className="stat-value">{totals.warning}</div>
          <div className="stat-note">Samples outside good range</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Critical alerts</span><span className="status-dot" style={{ background: STATUS_COLOR.CRITICAL }} /></div>
          <div className="stat-value">{totals.critical}</div>
          <div className="stat-note">Threshold breaches</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-title">Current status</span></div>
          <div className="stat-value" style={{ fontSize: 18, marginTop: 8 }}><StatusBadge status={statuses.turbidity} /></div>
          <div className="stat-note">Worst parameter right now</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <span className="filter-label">Range:</span>
        {[['6h', 'Last 6 hours'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days']].map(([k, l]) => (
          <button key={k} className={`filter-btn ${range === k ? 'active' : ''}`} onClick={() => setRange(k)}>{l}</button>
        ))}
        <span className="filter-label" style={{ marginLeft: 16 }}>Sensors:</span>
        {SENSOR_ORDER.map((k) => (
          <button
            key={k}
            className={`filter-btn ${selected.includes(k) ? 'active' : ''}`}
            onClick={() => toggleSensor(k)}
          >
            {SENSOR_META[k].short}
          </button>
        ))}
      </div>

      {/* Trends */}
      <section className="section">
        <h2 className="section-title">
          Sensor trends {usingSpark ? '(Spark aggregated)' : '(simulated)'} — {range}
        </h2>
        {!initialized ? (
          <div className="loading"><div className="spinner" /><p>Loading analytics…</p></div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No sensors selected</p>
            <p className="empty-desc">Pick at least one sensor above to plot its trend.</p>
          </div>
        ) : (
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={visible[0].series.map((p, i) => ({ ...p, t: fmtTime(p.ts ?? p.time, range), i }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatReading} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) => [formatReading(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {visible[0].good && (
                  <ReferenceLine
                    y={visible[0].good.max}
                    stroke={STATUS_COLOR.NORMAL}
                    strokeDasharray="4 4"
                    label={{ value: 'good max', fontSize: 10, fill: '#16a34a' }}
                  />
                )}
                {visible.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey="value"
                    name={`${s.label}${s.unit ? ` (${s.unit})` : ''}`}
                    stroke={SENSOR_META[s.key] ? SENSOR_COLORS[s.key] : '#0891b2'}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="chart-footnote">
              Plotting the first selected sensor across the window; switch sensors above to compare.
            </p>
          </div>
        )}
      </section>

      {/* Per-sensor summary table */}
      <section className="section">
        <h2 className="section-title">Sensor performance summary</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sensor</th><th>Avg</th><th>Min</th><th>Max</th>
                <th>Warning</th><th>Critical</th><th>In range</th><th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}{s.unit ? ` (${s.unit})` : ''}</td>
                  <td>{formatReading(s.avg)}</td>
                  <td>{formatReading(s.min)}</td>
                  <td>{formatReading(s.max)}</td>
                  <td>{s.warningCount ?? '—'}</td>
                  <td>{s.criticalCount ?? '—'}</td>
                  <td>{s.inRangePct != null ? `${s.inRangePct}%` : '—'}</td>
                  <td>{s.trend ? `${s.trend.direction} (${s.trend.changePct}%)` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Before / after filtration */}
      <section className="section">
        <h2 className="section-title">Before vs after filtration</h2>
        {!filtration.length ? (
          <div className="empty-state">
            <p className="empty-title">No filtration comparison yet</p>
            <p className="empty-desc">Run the filtration cycle to compare intake and outlet values.</p>
          </div>
        ) : (
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={filtration}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatReading} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) => [formatReading(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="before" name="Before filtration" fill="#60a5fa" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="after" name="After filtration" fill="#2563eb" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <p className="chart-footnote">
              Intake versus outlet averages
              {filtration[0]?.source === 'spark' ? ' computed by the Spark batch job' : ' from the local simulation model'}.
              {filtration[0]?.source === 'spark'
                ? ` ${filtration.length} sensors compared across ${filtration[0].samples} samples.`
                : ''}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

const SENSOR_COLORS = {
  ph: '#22c55e',
  turbidity: '#eab308',
  temperature: '#f97316',
  tds: '#06b6d4',
  do: '#38bdf8',
  optical: '#a78bfa',
};
