import React, { useMemo, useState } from 'react';
import Header from '../components/Header';
import { useSensors } from '../context/SensorContext';
import { buildAlerts } from '../utils/alerts';
import {
  Filter,
  AlertTriangle,
  Flame,
  ShieldCheck,
  Zap,
  RotateCcw,
  CheckCheck,
} from 'lucide-react';

const severityClass = (s) => (s === 'Critical' ? 'red' : s === 'Poor' ? 'orange' : 'yellow');
const severityWord = (s) => (s === 'Moderate' ? 'Warning' : s);

function fmt(ts) {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Only the most recent matching alerts are rendered, to keep the list readable.
const MAX_VISIBLE_ALERTS = 10;

export default function Alerts({ onMenuToggle, onOpenThresholds }) {
  const {
    history,
    initialized,
    connectionStatus,
    phase,
    treatmentCycles,
    lastTreatment,
    paused,
    thresholds,
    clearedAlerts,
    dismissAlert,
    clearAllAlerts,
    restoreAlerts,
    triggerEvent,
  } = useSensors();

  const [severityFilter, setSeverityFilter] = useState('ALL'); // 'ALL' | 'Moderate' | 'Poor' | 'Critical'
  const [sensorFilter, setSensorFilter] = useState('ALL'); // 'ALL' | 'ph' | 'turbidity' | 'temperature' | 'tds'

  // Generate alerts dynamically from history using active thresholds
  const rawAlerts = useMemo(() => {
    if (!initialized) return [];
    return buildAlerts(history, thresholds);
  }, [history, initialized, thresholds]);

  // Filter out dismissed alerts
  const activeAlerts = useMemo(() => {
    return rawAlerts.filter((a) => !clearedAlerts.has(a.id));
  }, [rawAlerts, clearedAlerts]);

  // Apply UI filter (Severity & Sensor)
  const filteredAlerts = useMemo(() => {
    return activeAlerts.filter((a) => {
      const matchSeverity = severityFilter === 'ALL' || a.status === severityFilter;
      const matchSensor =
        sensorFilter === 'ALL' ||
        a.sensor.toLowerCase().includes(sensorFilter.toLowerCase()) ||
        a.parameter.toLowerCase().includes(sensorFilter.toLowerCase());
      return matchSeverity && matchSensor;
    });
  }, [activeAlerts, severityFilter, sensorFilter]);

  const counts = {
    total: activeAlerts.length,
    Moderate: activeAlerts.filter((a) => a.status === 'Moderate').length,
    Poor: activeAlerts.filter((a) => a.status === 'Poor').length,
    Critical: activeAlerts.filter((a) => a.status === 'Critical').length,
  };

  // Render at most the 10 newest matching alerts.
  const visibleAlerts = useMemo(
    () => filteredAlerts.slice(0, MAX_VISIBLE_ALERTS),
    [filteredAlerts],
  );
  const hiddenCount = filteredAlerts.length - visibleAlerts.length;

  const handleClearAll = () => {
    clearAllAlerts(rawAlerts.map((a) => a.id));
  };

  return (
    <div className="page">
      <Header
        title="Alerts & Threshold Notifications"
        subtitle="Automated edge event logging, threshold breaches, and acoustic mitigation alerts"
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />

      {/* Summary Chips & Demo Control Toolbar */}
      <div className="alerts-toolbar">
        <div className="alerts-summary-chips">
          <button
            type="button"
            className={`filter-chip all ${severityFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('ALL')}
          >
            All Alerts ({counts.total})
          </button>
          <button
            type="button"
            className={`filter-chip yellow ${severityFilter === 'Moderate' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('Moderate')}
          >
            <AlertTriangle size={14} />
            <span>{counts.Moderate} Warnings</span>
          </button>
          <button
            type="button"
            className={`filter-chip orange ${severityFilter === 'Poor' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('Poor')}
          >
            <AlertTriangle size={14} />
            <span>{counts.Poor} Poor Status</span>
          </button>
          <button
            type="button"
            className={`filter-chip red ${severityFilter === 'Critical' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('Critical')}
          >
            <Flame size={14} />
            <span>{counts.Critical} Critical</span>
          </button>
        </div>

        <div className="alerts-action-buttons">
          {clearedAlerts.size > 0 ? (
            <button type="button" className="action-btn secondary" onClick={restoreAlerts}>
              <RotateCcw size={14} />
              <span>Restore Cleared Alerts</span>
            </button>
          ) : (
            activeAlerts.length > 0 && (
              <button type="button" className="action-btn secondary" onClick={handleClearAll}>
                <CheckCheck size={14} />
                <span>Acknowledge All</span>
              </button>
            )
          )}
          <button
            type="button"
            className="action-btn primary"
            onClick={triggerEvent}
            disabled={phase !== 'Monitoring'}
            title="Triggers a simulated algae/turbidity surge to generate live alerts"
          >
            <Zap size={14} />
            <span>Simulate Contamination</span>
          </button>
        </div>
      </div>

      {/* Sensor Filter Dropdown Bar */}
      <div className="sensor-filter-bar">
        <span className="filter-bar-label">
          <Filter size={14} className="cyan-icon" /> Filter by Sensor:
        </span>
        <div className="sensor-filter-buttons">
          {[
            ['ALL', 'All Sensors'],
            ['ph', 'pH Sensor'],
            ['turbidity', 'Turbidity Sensor'],
            ['temperature', 'Temperature Sensor'],
            ['tds', 'TDS Sensor'],
          ].map(([k, label]) => (
            <button
              key={k}
              className={`sensor-btn ${sensorFilter === k ? 'active' : ''}`}
              onClick={() => setSensorFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Edge System Telemetry Events Snapshot */}
      <section className="section">
        <h2 className="section-title">Edge Telemetry State & Treatment Log</h2>
        {!initialized ? (
          <div className="loading">
            <div className="spinner" />
            <p>Scanning edge telemetry buffer…</p>
          </div>
        ) : (
          <div className="event-grid">
            <div className="event-item">
              <span className="rev-label">Operating Phase</span>
              <span className="event-value">{phase}</span>
            </div>
            <div className="event-item">
              <span className="rev-label">Restoration Interventions</span>
              <span className="event-value">{treatmentCycles} Cycles Complete</span>
            </div>
            <div className="event-item">
              <span className="rev-label">Telemetry Feed</span>
              <span className="event-value">{paused ? 'Paused' : 'Active (3s tick)'}</span>
            </div>
            {lastTreatment && (
              <div className="event-item wide">
                <span className="rev-label">Last Revitalization Event</span>
                <span className="event-value">
                  Completed {fmt(lastTreatment.endedAt)} — Turbidity reduced from{' '}
                  <strong className="bad-txt">{lastTreatment.before?.turbidity} NTU</strong> to{' '}
                  <strong className="good-txt">{lastTreatment.after?.turbidity} NTU</strong>.
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Requirement 9: Alerts and Notifications List */}
      <section className="section">
        <div className="section-head-bar">
          <h2 className="section-title">
            Sensor Threshold Breach Logs ({filteredAlerts.length})
          </h2>
          <span className="sim-badge">Generated from Configured Thresholds</span>
        </div>

        {!initialized ? (
          <div className="loading">
            <div className="spinner" />
            <p>Loading alerts…</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          /* Requirement 9: Empty state when no alerts are present */
          <div className="empty-state-card alerts-empty">
            <ShieldCheck size={44} className="empty-shield-icon" />
            <h3 className="empty-title">Zero Active Alerts</h3>
            <p className="empty-desc">
              All monitored water quality sensors (pH, Turbidity, Temperature, TDS) are within their configured
              thresholds. No threshold breaches or safety violations are detected in the active telemetry buffer.
            </p>
            <p className="empty-hint">
              You can click <strong>"Simulate Contamination"</strong> above or adjust thresholds using the{' '}
              <strong>"Thresholds"</strong> button in the header to demonstrate real-time alert generation.
            </p>
          </div>
        ) : (
          <div className="alert-list">
            {visibleAlerts.map((a) => (
              <div className={`alert-item ${severityClass(a.status)}`} key={a.id}>
                <span className="alert-dot" />
                <div className="alert-body">
                  <div className="alert-top">
                    <span className="alert-msg">{a.message}</span>
                    <div className="alert-badge-group">
                      <span className={`severity ${severityClass(a.status)}`}>
                        {severityWord(a.status)}
                      </span>
                      <button
                        type="button"
                        className="dismiss-alert-btn"
                        onClick={() => dismissAlert(a.id)}
                        title="Acknowledge this alert"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  {/* Requirement 9: Affected sensor, Recorded value, Severity, Date and time */}
                  <div className="alert-meta">
                    <span className="meta-tag">
                      <strong>Affected Sensor:</strong> {a.sensor}
                    </span>
                    <span className="meta-tag">
                      <strong>Recorded Value:</strong> {a.value} {a.unit}
                    </span>
                    <span className="meta-tag">
                      <strong>Severity:</strong> {a.status}
                    </span>
                    <span className="meta-tag">
                      <strong>Date & Time:</strong> {fmt(a.time)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {hiddenCount > 0 && (
              <p className="alert-list-note">
                Showing the {visibleAlerts.length} most recent alerts · {hiddenCount} older{' '}
                {hiddenCount === 1 ? 'alert is' : 'alerts are'} hidden. Use the filters above to narrow the list.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
