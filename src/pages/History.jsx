import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import { useSensors } from '../context/SensorContext';
import { Download, Calendar, Table, BarChart2 } from 'lucide-react';
import { THRESHOLD_LABEL } from '../utils/quality';

const RANGES = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const SERIES = [
  { key: 'ph', label: 'pH Level', unit: '', color: '#22c55e', domain: [4, 11] },
  { key: 'turbidity', label: 'Turbidity', unit: 'NTU', color: '#eab308', domain: [0, 40] },
  { key: 'temperature', label: 'Temperature', unit: '°C', color: '#f97316', domain: [15, 40] },
  { key: 'tds', label: 'TDS (Total Dissolved Solids)', unit: 'ppm', color: '#06b6d4', domain: [100, 1200] },
  { key: 'do', label: 'Dissolved Oxygen', unit: 'mg/L', color: '#38bdf8', domain: [2, 12] },
  { key: 'optical', label: 'Optical Underwater', unit: '%', color: '#a78bfa', domain: [20, 100] },
];

function fmtTime(ts, range) {
  const d = new Date(ts);
  if (range === '1h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (range === '24h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function fmtFull(ts) {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function HistoryPage({ onMenuToggle, onOpenThresholds }) {
  const { history, statuses, initialized, connectionStatus, thresholds } = useSensors();
  const [range, setRange] = useState('7d');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'combined'
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const TABLE_ROW_LIMIT = 15;

  const cutoff = useMemo(() => nowTimestamp - RANGES[range], [nowTimestamp, range]);

  // Aggregate telemetry rows for historical table
  const tableRows = useMemo(() => {
    const map = new Map();
    SERIES.forEach((s) => {
      (history[s.key] || []).forEach((p) => {
        if (p.time < cutoff) return;
        // Bucket by minute to align readings from all 4 sensors
        const bucket = Math.round(p.time / 60000);
        if (!map.has(bucket)) map.set(bucket, { time: p.time });
        map.get(bucket)[s.key] = p.value;
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.time - a.time);
  }, [history, cutoff]);

  // Summary statistics for selected range
  const rangeStats = useMemo(() => {
    const stats = {};
    SERIES.forEach((s) => {
      const pts = (history[s.key] || [])
        .filter((p) => p.time >= cutoff)
        .map((p) => p.value);
      if (pts.length > 0) {
        stats[s.key] = {
          min: Math.min(...pts),
          max: Math.max(...pts),
          avg: +(pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1),
          count: pts.length,
        };
      } else {
        stats[s.key] = { min: '—', max: '—', avg: '—', count: 0 };
      }
    });
    return stats;
  }, [history, cutoff]);

  // Combined chart dataset
  const combinedData = useMemo(() => {
    if (viewMode !== 'combined') return [];
    const map = new Map();
    SERIES.forEach((s) => {
      (history[s.key] || []).forEach((p) => {
        if (p.time < cutoff) return;
        const bucket = Math.round(p.time / 60000);
        if (!map.has(bucket)) {
          map.set(bucket, {
            time: p.time,
            t: fmtTime(p.time, range),
          });
        }
        map.get(bucket)[s.key] = p.value;
      });
    });
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  }, [history, cutoff, range, viewMode]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (!tableRows.length) return;
    const headers = ['Timestamp', 'Date_Time_ISO', 'pH', 'Turbidity_NTU', 'Temperature_C', 'TDS_ppm'];
    const csvContent = [
      headers.join(','),
      ...tableRows.map((r) =>
        [
          r.time,
          `"${new Date(r.time).toISOString()}"`,
          r.ph ?? '',
          r.turbidity ?? '',
          r.temperature ?? '',
          r.tds ?? '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `aerias_aquatic_telemetry_${range}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page">
      <Header
        title="Sensor History & Trends"
        subtitle="Longitudinal time-series analysis and historical telemetry archive (simulated)"
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />

      {/* Control bar: Time filters, View Mode, Export CSV */}
      <div className="history-toolbar">
        <div className="time-filter-group">
          <Calendar size={16} className="cyan-icon" />
          <span className="filter-title">Time Window:</span>
          {[
            ['1h', 'Last 1 Hour'],
            ['24h', 'Last 24 Hours'],
            ['7d', 'Last 7 Days'],
          ].map(([k, label]) => (
            <button
              key={k}
              className={`time-btn ${range === k ? 'active' : ''}`}
              onClick={() => {
                setRange(k);
                setNowTimestamp(Date.now());
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="history-actions-right">
          <div className="view-mode-toggle">
            <button
              className={`mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Individual Charts Grid"
            >
              <BarChart2 size={15} />
              <span>4 Parameter Charts</span>
            </button>
            <button
              className={`mode-btn ${viewMode === 'combined' ? 'active' : ''}`}
              onClick={() => setViewMode('combined')}
              title="Combined Multi-Parameter Chart"
            >
              <Table size={15} />
              <span>Combined Multi-Trend</span>
            </button>
          </div>

          <button className="export-csv-btn" onClick={handleExportCSV}>
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {!initialized ? (
        <div className="loading">
          <div className="spinner" />
          <p>Compiling historical time-series datasets…</p>
        </div>
      ) : tableRows.length === 0 ? (
        <div className="empty-state-card">
          <h3 className="empty-title">No Telemetry Recorded in this Time Window</h3>
          <p className="empty-desc">
            Try switching to 'Last 24 Hours' or 'Last 7 Days' to view archived sensor recordings.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Statistics for Selected Time Range */}
          <div className="range-stats-panel">
            <div className="stats-header-bar">
              <span className="stats-panel-title">Summary Statistics for Selected Window ({range})</span>
              <span className="stats-sample-count">Total Data Points: {tableRows.length}</span>
            </div>
            <div className="stats-metrics-grid">
              {SERIES.map((s) => {
                const st = rangeStats[s.key] || {};
                return (
                  <div className="stat-summary-pill" key={s.key}>
                    <div className="pill-top">
                      <span className="pill-name" style={{ color: s.color }}>
                        {s.label}
                      </span>
                      <StatusBadge status={statuses[s.key]} />
                    </div>
                    <div className="pill-numbers">
                      <span>Min: <strong>{st.min}</strong></span>
                      <span>Avg: <strong>{st.avg}</strong></span>
                      <span>Max: <strong>{st.max}</strong></span>
                      {s.unit && <span className="pill-unit">{s.unit}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recharts Charts Display */}
          {viewMode === 'grid' ? (
            /* Requirement 8: Individual Parameter Charts */
            <div className="charts-grid-stack">
              {SERIES.map((s) => {
                const data = (history[s.key] || [])
                  .filter((p) => p.time >= cutoff)
                  .map((p) => ({
                    ...p,
                    t: fmtTime(p.time, range),
                  }));

                const goodBand = thresholds[s.key]?.bands[0] || {};

                return (
                  <div className="chart-card" key={s.key}>
                    <div className="chart-card-header">
                      <div className="chart-title-group">
                        <span className="chart-param-label">{s.label}</span>
                        {s.unit && <span className="chart-unit">({s.unit})</span>}
                        <span className="chart-target-range">
                          Target: {THRESHOLD_LABEL(s.key, thresholds)}
                        </span>
                      </div>
                      <StatusBadge status={statuses[s.key]} />
                    </div>

                    <div className="chart-canvas-wrap">
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={data} margin={{ top: 12, right: 20, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="t"
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            minTickGap={32}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 8,
                              border: '1px solid #cbd5e1',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                              fontSize: 12,
                            }}
                            formatter={(v) => [`${v} ${s.unit}`, s.label]}
                            labelFormatter={(l) => `Timestamp: ${l}`}
                          />
                          {goodBand.min != null && isFinite(goodBand.min) && (
                            <ReferenceLine
                              y={goodBand.min}
                              stroke="#22c55e"
                              strokeDasharray="4 4"
                              label={{ value: `Min ${goodBand.min}`, fill: '#16a34a', fontSize: 10 }}
                            />
                          )}
                          {goodBand.max != null && isFinite(goodBand.max) && (
                            <ReferenceLine
                              y={goodBand.max}
                              stroke="#22c55e"
                              strokeDasharray="4 4"
                              label={{ value: `Max ${goodBand.max}`, fill: '#16a34a', fontSize: 10 }}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="value"
                            name={s.label}
                            stroke={s.color}
                            strokeWidth={2.2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Combined Multi-Parameter Chart */
            <div className="chart-card combined-chart-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-param-label">Synchronized Multi-Parameter Correlation</span>
                  <p className="chart-subtitle-note">
                    Visualizes cross-correlation between Turbidity spikes, TDS surges, and pH elevation
                  </p>
                </div>
                <span className="sim-badge">4 Sensors Superimposed</span>
              </div>
              <div className="chart-canvas-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={combinedData} margin={{ top: 12, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      minTickGap={32}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        fontSize: 12,
                      }}
                      labelFormatter={(l) => `Timestamp: ${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Line type="monotone" dataKey="ph" name="pH" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="turbidity" name="Turbidity (NTU)" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="tds" name="TDS (ppm)" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Historical Readings Table with Timestamps */}
          <section className="section">
            <div className="section-head-bar">
              <h2 className="section-title">Historical Telemetry Log Table</h2>
              <span className="table-row-label">Showing the latest 15 readings from the selected historical window</span>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>pH Reading</th>
                    <th>Turbidity (NTU)</th>
                    <th>Temperature (°C)</th>
                    <th>TDS (ppm)</th>
                    <th>Data Source</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(0, TABLE_ROW_LIMIT).map((r) => (
                    <tr key={r.time}>
                      <td className="timestamp-col">
                        <strong>{fmtFull(r.time)}</strong>
                      </td>
                      <td className="tabular-val">{r.ph ?? '—'}</td>
                      <td className="tabular-val">{r.turbidity ?? '—'}</td>
                      <td className="tabular-val">{r.temperature ?? '—'}</td>
                      <td className="tabular-val">{r.tds ?? '—'}</td>
                      <td>
                        <span className="sim-inline-tag">Simulated Buffer</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-pagination-info">
              <span>
                Displaying 1–{Math.min(TABLE_ROW_LIMIT, tableRows.length)} of {tableRows.length} recorded telemetry samples in window ({range}).
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
