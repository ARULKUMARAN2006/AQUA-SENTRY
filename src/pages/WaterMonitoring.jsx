import React from 'react';
import Header from '../components/Header';
import MiniTrend from '../components/MiniTrend';
import StatusBadge from '../components/StatusBadge';
import StatusDot from '../components/StatusDot';
import { useSensors } from '../context/SensorContext';
import { THRESHOLD_LABEL } from '../utils/quality';
import { Activity, Sliders, Cpu, Radio } from 'lucide-react';

const PARAMS = [
  {
    key: 'ph',
    label: 'pH Level',
    unit: '',
    color: '#22c55e',
    resolution: '0.01 pH',
  },
  {
    key: 'turbidity',
    label: 'Turbidity',
    unit: 'NTU',
    color: '#eab308',
    resolution: '0.1 NTU',
  },
  {
    key: 'temperature',
    label: 'Water Temperature',
    unit: '°C',
    color: '#f97316',
    resolution: '0.0625 °C',
  },
  {
    key: 'tds',
    label: 'TDS (Total Dissolved Solids)',
    unit: 'ppm',
    color: '#06b6d4',
    resolution: '1 ppm',
  },
  {
    key: 'do',
    label: 'Dissolved Oxygen',
    unit: 'mg/L',
    color: '#38bdf8',
    resolution: '0.01 mg/L',
  },
  {
    key: 'optical',
    label: 'Optical Underwater',
    unit: '%',
    color: '#a78bfa',
    resolution: '1 %T',
  },
];

export default function WaterMonitoring({ onMenuToggle, onOpenThresholds }) {
  const { readings, statuses, history, initialized, connectionStatus, phase, thresholds, paused } =
    useSensors();

  // Calculate session statistics for each sensor
  const stats = React.useMemo(() => {
    const s = {};
    PARAMS.forEach((p) => {
      const series = history[p.key] || [];
      const values = series.slice(-60).map((pt) => pt.value);
      if (values.length > 0) {
        s[p.key] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
        };
      } else {
        s[p.key] = { min: '—', max: '—', avg: '—' };
      }
    });
    return s;
  }, [history]);

  return (
    <div className="page">
      <Header
        title="Live Water Monitoring"
        subtitle="Continuous aquatic sensor telemetry and edge signal conditioning"
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />

      <div className="telemetry-bar-info">
        <div className="telemetry-chip">
          <Radio size={14} className="cyan-icon" />
          <span>Sampling Interval: <strong>3.0 Seconds</strong></span>
        </div>
        <div className="telemetry-chip">
          <Cpu size={14} className="cyan-icon" />
          <span>Edge Microcontroller: <strong>ESP32 Gateway (Simulated)</strong></span>
        </div>
        <div className="telemetry-chip">
          <Activity size={14} className="cyan-icon" />
          <span>Telemetry Stream: <strong>{paused ? 'Paused' : 'Continuous Live'}</strong></span>
        </div>
        <div className="telemetry-chip">
          <span>Operating Phase: <strong>{phase}</strong></span>
        </div>
      </div>

      {!initialized ? (
        <div className="loading">
          <div className="spinner" />
          <p>Connecting to simulated edge sensor buffer…</p>
        </div>
      ) : (
        <>
          {/* 4 Sensor Cards with current value, unit, status indicator, and trend chart */}
          <div className="monitor-grid">
            {PARAMS.map((p) => {
              const val = readings[p.key];
              const st = statuses[p.key];
              const paramStats = stats[p.key] || {};
              return (
                <div className="monitor-card" key={p.key}>
                  <div className="monitor-header">
                    <div className="monitor-title-group">
                      <span className="monitor-label">{p.label}</span>
                      <span className="monitor-sensor-type">{p.sensorModel}</span>
                    </div>
                    <div className="header-status-badge">
                      <StatusDot status={st} />
                      <StatusBadge status={st} />
                    </div>
                  </div>

                  <div className="monitor-value-wrap">
                    <span className="monitor-value">
                      {val == null ? 'Offline' : val}
                    </span>
                    {val != null && p.unit && (
                      <span className="monitor-unit">{p.unit}</span>
                    )}
                  </div>

                  <div className="monitor-trend-container">
                    <span className="mini-chart-label">Recent Trend (20 samples)</span>
                    <MiniTrend data={history[p.key]} color={p.color} />
                  </div>

                  <div className="monitor-stats-row">
                    <div className="m-stat">
                      <span className="m-stat-label">Min</span>
                      <span className="m-stat-val">{paramStats.min}</span>
                    </div>
                    <div className="m-stat">
                      <span className="m-stat-label">Avg</span>
                      <span className="m-stat-val">{paramStats.avg}</span>
                    </div>
                    <div className="m-stat">
                      <span className="m-stat-label">Max</span>
                      <span className="m-stat-val">{paramStats.max}</span>
                    </div>
                  </div>

                  <div className="monitor-threshold-box">
                    <span>Target Range:</span>
                    <strong>{THRESHOLD_LABEL(p.key, thresholds)}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sensor readings table with parameter name, current value, unit, and status */}
          <section className="section">
            <div className="section-head-bar">
              <h2 className="section-title">Sensor Readings Telemetry Table</h2>
              <button
                type="button"
                className="section-sub-link"
                onClick={onOpenThresholds}
              >
                <Sliders size={14} /> Adjust Configured Thresholds
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Parameter Name</th>
                    <th>Current Value</th>
                    <th>Unit</th>
                    <th>Status</th>
                    <th>Good Range</th>
                    <th>Hardware Sensor Interface</th>
                    <th>Resolution</th>
                    <th>Telemetry Source</th>
                  </tr>
                </thead>
                <tbody>
                  {PARAMS.map((p) => {
                    const val = readings[p.key];
                    const st = statuses[p.key];
                    return (
                      <tr key={p.key}>
                        <td>
                          <strong>{p.label}</strong>
                        </td>
                        <td className="tabular-val">
                          {val == null ? 'Offline' : val}
                        </td>
                        <td>{p.unit || '—'}</td>
                        <td>
                          <StatusBadge status={st} />
                        </td>
                        <td>
                          <span className="range-tag">{THRESHOLD_LABEL(p.key, thresholds)}</span>
                        </td>
                        <td>{p.sensorModel}</td>
                        <td>{p.resolution}</td>
                        <td>
                          <span className="sim-inline-tag">Simulated Telemetry</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="table-footer-note">
              Telemetry values update automatically every 3 seconds via the edge simulation engine. Configurable
              thresholds dictate real-time status classification.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
