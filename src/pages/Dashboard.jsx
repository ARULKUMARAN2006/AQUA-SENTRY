import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Sliders,
  ChevronRight,
  Bot,
} from 'lucide-react';
import Header from '../components/Header';
import MiniTrend from '../components/MiniTrend';
import StatusBadge from '../components/StatusBadge';
import StatusDot from '../components/StatusDot';
import RevitalizationPanel from '../components/RevitalizationPanel';
import SimulationPanel from '../components/SimulationPanel';
import AlgaeCollectionPanel from '../components/AlgaeCollectionPanel';
import TreatmentStudio from '../components/TreatmentStudio';
import { useSensors } from '../context/SensorContext';
import { THRESHOLD_LABEL } from '../utils/quality';

const PROJECT = 'Adaptive Edge-Driven Intelligent Aquatic Revitalization System';

const TRENDS = [
  { key: 'ph', label: 'pH Level', unit: '', color: '#22c55e' },
  { key: 'turbidity', label: 'Turbidity', unit: 'NTU', color: '#eab308' },
  { key: 'temperature', label: 'Water Temperature', unit: '°C', color: '#f97316' },
  { key: 'tds', label: 'TDS (Total Dissolved Solids)', unit: 'ppm', color: '#06b6d4' },
  { key: 'do', label: 'Dissolved Oxygen', unit: 'mg/L', color: '#38bdf8' },
  { key: 'optical', label: 'Optical Underwater', unit: '%', color: '#a78bfa' },
];

const shown = (v) => (v == null ? '—' : v);

export default function Dashboard({ onNavigate, onMenuToggle, onOpenThresholds }) {
  const {
    readings,
    statuses,
    overall,
    wqi,
    history,
    connectionStatus,
    phase,
    initialized,
    thresholds,
    robot,
    treatment,
    iotSourceUrl,
    iotLastUpdated,
  } = useSensors();

  return (
    <div className="page">
      <Header
        title={PROJECT}
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />

      <div className="telemetry-banner">
        <div className="telemetry-banner-left">
          <span className="live-dot" />
          <span className="telemetry-label">Telemetry Stream:</span>
          <strong>
            IoT readings: {connectionStatus} (30s refresh)
            {iotLastUpdated && ` — last update ${new Date(iotLastUpdated).toLocaleTimeString()}`}
          </strong>
          <span className="telemetry-pipe">|</span>
          <span>Current Phase: <strong>{phase}</strong></span>
        </div>
        <div className="telemetry-banner-right">
          <a
            className="studio-dashboard-link"
            href={iotSourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            View IoT readings
          </a>
          <Link className="studio-dashboard-link" to="/treatment-studio">
            Open Treatment Studio
          </Link>
        </div>
      </div>

      {!initialized ? (
        <div className="loading">
          <div className="spinner" />
          <p>Initializing edge telemetry stream & 7-day historical buffer…</p>
        </div>
      ) : (
        <>
          {/* Requirement 3: Below header, four summary cards:
              1. Water Quality Status
              2. pH Level
              3. Turbidity (NTU)
              4. Water Temperature (°C)
          */}
          <div className="cards-grid primary-cards">
            {/* 1. Water Quality Status */}
            <div className={`stat-card quality-summary-card ${overall.toLowerCase()}`}>
              <div className="stat-header">
                <span className="stat-title">Water Quality Status</span>
                <StatusDot status={overall} />
              </div>
              <div className="quality-main-row">
                <StatusBadge status={overall} />
                <div className="wqi-pill" title="Calculated Water Quality Index">
                  WQI: <strong>{wqi}/100</strong>
                </div>
              </div>
              <p className="quality-explanation">
                {overall === 'Good'
                  ? 'All parameters within configured thresholds.'
                  : `Breached threshold on ${
                      Object.entries(statuses)
                        .filter(([, s]) => s !== 'Good')
                        .map(([k]) => k.toUpperCase())
                        .join(', ') || 'sensors'
                    }.`}
              </p>
              <div className="card-action-row">
                <button
                  type="button"
                  className="link-btn"
                  onClick={onOpenThresholds}
                  title="Configure classification limits"
                >
                  <Sliders size={13} />
                  <span>Config Thresholds</span>
                </button>
              </div>
            </div>

            {/* 2. pH Level */}
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">pH Level</span>
                <StatusDot status={statuses.ph} />
              </div>
              <div className="stat-value">
                {shown(readings.ph)}
                <span className="stat-unit">pH</span>
              </div>
              <div className="stat-footer">
                <StatusBadge status={statuses.ph} />
                <span className="stat-note">{THRESHOLD_LABEL('ph', thresholds)}</span>
              </div>
              <MiniTrend data={history.ph} color="#22c55e" />
            </div>

            {/* 3. Turbidity (NTU) */}
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Turbidity</span>
                <StatusDot status={statuses.turbidity} />
              </div>
              <div className="stat-value">
                {shown(readings.turbidity)}
                <span className="stat-unit">NTU</span>
              </div>
              <div className="stat-footer">
                <StatusBadge status={statuses.turbidity} />
                <span className="stat-note">{THRESHOLD_LABEL('turbidity', thresholds)}</span>
              </div>
              <MiniTrend data={history.turbidity} color="#eab308" />
            </div>

            {/* 4. Water Temperature (°C) */}
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Water Temperature</span>
                <StatusDot status={statuses.temperature} />
              </div>
              <div className="stat-value">
                {shown(readings.temperature)}
                <span className="stat-unit">°C</span>
              </div>
              <div className="stat-footer">
                <StatusBadge status={statuses.temperature} />
                <span className="stat-note">{THRESHOLD_LABEL('temperature', thresholds)}</span>
              </div>
              <MiniTrend data={history.temperature} color="#f97316" />
            </div>
          </div>

          {/* Requirement 3: Add a separate TDS (ppm) reading card. */}
          <div className="secondary-row-grid">
            <div className="stat-card featured-tds-card">
              <div className="stat-header">
                <div className="title-with-icon">
                  <Activity size={16} className="cyan-icon" />
                  <span className="stat-title">TDS (Total Dissolved Solids)</span>
                </div>
                <StatusDot status={statuses.tds} />
              </div>
              <div className="tds-content-split">
                <div className="tds-value-block">
                  <div className="stat-value">
                    {shown(readings.tds)}
                    <span className="stat-unit">ppm</span>
                  </div>
                  <div className="stat-footer">
                    <StatusBadge status={statuses.tds} />
                    <span className="stat-note">{THRESHOLD_LABEL('tds', thresholds)}</span>
                  </div>
                  <p className="tds-description">
                    Measures inorganic salts & dissolved organic matter in freshwater.
                  </p>
                </div>
                <div className="tds-chart-block">
                  <span className="mini-chart-title">Recent 20 Readings</span>
                  <MiniTrend data={history.tds} color="#06b6d4" />
                </div>
              </div>
            </div>

            {/* Robot Quick Status Preview */}
            <div className="stat-card robot-preview-card">
              <div className="stat-header">
                <div className="title-with-icon">
                  <Bot size={16} className="cyan-icon" />
                  <span className="stat-title">Aquatic Robot Telemetry</span>
                </div>
                <span className="mode-pill sm">{robot.mode}</span>
              </div>
              <div className="robot-preview-content">
                <div className="preview-metrics">
                  <div className="p-metric">
                    <span className="p-label">ESP32 Gateway</span>
                    <StatusBadge status="Active" />
                  </div>
                  <div className="p-metric">
                    <span className="p-label">Ultrasonic Treatment</span>
                    <StatusBadge status={treatment.state} />
                  </div>
                  <div className="p-metric">
                    <span className="p-label">Thruster Status</span>
                    <span className="thruster-quick-badge">
                      {Object.values(robot.thrusters).filter((s) => s === 'Active').length}/4 Active
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="card-nav-link"
                  onClick={() => onNavigate && onNavigate('Robot Status')}
                >
                  <span>View Full Robot Schematic</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Live Water Trends Section */}
          <section className="section">
            <div className="section-head-bar">
              <h2 className="section-title">Live Sensor Sparklines & Target Bands</h2>
              <button
                type="button"
                className="section-sub-link"
                onClick={() => onNavigate && onNavigate('Water Monitoring')}
              >
                Go to Dedicated Water Monitoring <ChevronRight size={14} />
              </button>
            </div>
            <div className="trend-grid">
              {TRENDS.map((t) => (
                <div className="trend-card" key={t.key}>
                  <div className="trend-card-header">
                    <div>
                      <span className="trend-param-name">{t.label}</span>
                      <span className="trend-current-val">
                        {shown(readings[t.key])} {t.unit}
                      </span>
                    </div>
                    <StatusBadge status={statuses[t.key]} />
                  </div>
                  <MiniTrend data={history[t.key]} color={t.color} />
                  <div className="trend-card-footer">
                    <span className="trend-range-note">
                      Optimal Target: {THRESHOLD_LABEL(t.key, thresholds)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Requirement 7: Intelligent Aquatic Revitalization Section */}
      <RevitalizationPanel />

      {/* Live Simulation Controls & Operating Cycle */}
      <SimulationPanel />

      {/* Separate physical capture stage: algae collection + waste basket */}
      <AlgaeCollectionPanel />

      <TreatmentStudio />
    </div>
  );
}
