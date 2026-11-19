import React from 'react';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import StatusDot from '../components/StatusDot';
import { useSensors } from '../context/SensorContext';
import { classifyNamed, THRESHOLD_LABEL } from '../utils/quality';
import {
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

const PARAMS = [
  {
    key: 'ph',
    label: 'pH Level',
    unit: '',
    baseline: 7.4,
    significance:
      'Indicates acidity/alkalinity. Algal blooms consume dissolved CO2 during daytime photosynthesis, causing pH to spike (>8.5).',
  },
  {
    key: 'turbidity',
    label: 'Turbidity',
    unit: 'NTU',
    baseline: 3.2,
    significance:
      'Measures optical clarity and suspended solids. Spikes signify runoff or microalgae cell proliferation, obstructing sunlight penetration.',
  },
  {
    key: 'temperature',
    label: 'Water Temperature',
    unit: '°C',
    baseline: 24.5,
    significance:
      'Governs dissolved oxygen saturation and biological reaction kinetics. Warmer temperatures accelerate cyanobacterial multiplication.',
  },
  {
    key: 'tds',
    label: 'TDS (Total Dissolved Solids)',
    unit: 'ppm',
    baseline: 240,
    significance:
      'Quantifies total inorganic mineral salts and dissolved electrolytes. Sudden surges indicate agricultural runoff or mineral leaching.',
  },
  {
    key: 'do',
    label: 'Dissolved Oxygen',
    unit: 'mg/L',
    baseline: 8.4,
    significance:
      'Measures the oxygen available to aquatic life. Decomposing algae and organic load consume DO, risking hypoxia and fish kill.',
  },
  {
    key: 'optical',
    label: 'Optical Underwater',
    unit: '%',
    baseline: 91,
    significance:
      'Tracks the share of surface light still reaching sensor depth. Low transmission confirms suspended algae blocking photosynthesis.',
  },
];

function explainAbnormality(key, value, status, thresholds) {
  const t = thresholds[key];
  const good = t.bands[0];
  if (status === 'Unknown') {
    return `${t.label} sensor is offline or not reporting valid telemetry.`;
  }
  if (status === 'Good') {
    return `${t.label} (${value} ${t.unit}) is within optimal thresholds (${good.min}–${good.max} ${t.unit}). Ecosystem conditions are stable.`;
  }
  if (status === 'Moderate') {
    return `${t.label} (${value} ${t.unit}) has drifted outside the optimal range (${good.min}–${good.max} ${t.unit}). Edge controller is logging baseline drift.`;
  }
  if (status === 'Poor') {
    return `${t.label} (${value} ${t.unit}) has breached moderate limits. This indicates water degradation and prompts ultrasonic cavitation standby or initiation.`;
  }
  return `${t.label} (${value} ${t.unit}) has breached critical safety thresholds. Immediate edge revitalization protocol is engaged to suppress microalgae and mitigate contamination.`;
}

export default function WaterQualityAnalysis({ onMenuToggle, onOpenThresholds }) {
  const {
    readings,
    statuses,
    overall,
    wqi,
    connectionStatus,
    phase,
    initialized,
    thresholds,
    treatment,
  } = useSensors();

  const abnormal = PARAMS.filter((p) => statuses[p.key] !== 'Good');

  return (
    <div className="page">
      <Header
        title="Water Quality Analysis"
        subtitle="Multi-parameter threshold evaluation, abnormality detection, and edge diagnostics"
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />

      {!initialized ? (
        <div className="loading">
          <div className="spinner" />
          <p>Running multi-parametric classification against configured thresholds…</p>
        </div>
      ) : (
        <>
          {/* Top Overall Water Quality Evaluation Section */}
          <div className="analysis-top-grid">
            <div
              className="analysis-overall-card"
              style={{ borderLeftColor: classifyNamed(overall) }}
            >
              <div className="analysis-header-row">
                <span className="card-badge-label">Overall Evaluation</span>
                <button
                  type="button"
                  className="threshold-link-btn"
                  onClick={onOpenThresholds}
                >
                  <SlidersHorizontal size={14} />
                  <span>Configure Thresholds</span>
                </button>
              </div>

              <div className="analysis-main-status">
                <StatusDot status={overall} />
                <span className="overall-status-text">{overall}</span>
                <StatusBadge status={overall} />
              </div>

              <div className="wqi-gauge-container">
                <div className="wqi-gauge-label">
                  <span>Water Quality Index (WQI)</span>
                  <strong>{wqi} / 100</strong>
                </div>
                <div className="wqi-track">
                  <div
                    className="wqi-fill"
                    style={{
                      width: `${wqi}%`,
                      backgroundColor: classifyNamed(overall),
                    }}
                  />
                </div>
              </div>

              <p className="analysis-derivation-text">
                Evaluated using worst-parameter threshold classification against active edge thresholds.
                Revitalization system status: <strong>{treatment.state}</strong>.
              </p>
            </div>

            <div className="analysis-metrics-card">
              <h3 className="metrics-card-title">Analysis Summary</h3>
              <div className="metrics-rows">
                <div className="m-row">
                  <span>Monitored Parameters</span>
                  <strong>{PARAMS.length}</strong>
                </div>
                <div className="m-row">
                  <span>Abnormal / Warning Parameters</span>
                  <strong style={{ color: abnormal.length ? '#f97316' : '#22c55e' }}>
                    {abnormal.length}
                  </strong>
                </div>
                <div className="m-row">
                  <span>Revitalization Unit State</span>
                  <StatusBadge status={treatment.state} />
                </div>
                <div className="m-row">
                  <span>Operating Cycle Phase</span>
                  <strong>{phase}</strong>
                </div>
                <div className="m-row">
                  <span>Edge Logic Engine</span>
                  <span className="sim-inline-tag">Configurable Thresholds</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Parameter Evaluation & Threshold Comparison */}
          <section className="section">
            <h2 className="section-title">Parameter Threshold Comparison</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Current Value</th>
                    <th>Configured Good Range</th>
                    <th>Status</th>
                    <th>Environmental Significance</th>
                    <th>Edge Diagnostic Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {PARAMS.map((p) => {
                    const st = statuses[p.key];
                    const val = readings[p.key];
                    return (
                      <tr key={p.key}>
                        <td>
                          <strong>{p.label}</strong>
                        </td>
                        <td className="tabular-val">
                          {val == null ? 'Offline' : `${val} ${p.unit}`}
                        </td>
                        <td>
                          <span className="range-tag">
                            {THRESHOLD_LABEL(p.key, thresholds)}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={st} />
                        </td>
                        <td className="significance-col">{p.significance}</td>
                        <td className="explanation-col">
                          {explainAbnormality(p.key, val, st, thresholds)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section: Abnormalities Identified */}
          <section className="section">
            <h2 className="section-title">Identified Abnormalities & Edge Action</h2>
            {abnormal.length === 0 ? (
              <div className="empty-state-card success">
                <CheckCircle2 size={36} className="empty-success-icon" />
                <h3 className="empty-title">Zero Abnormalities Detected</h3>
                <p className="empty-desc">
                  All four monitored parameters (pH, Turbidity, Temperature, TDS) currently reside within their
                  configured optimal target thresholds. The aquatic body exhibits biological equilibrium and
                  the ultrasonic revitalization transducer remains on standby.
                </p>
              </div>
            ) : (
              <div className="abnormal-cards-list">
                {abnormal.map((p) => {
                  const st = statuses[p.key];
                  const val = readings[p.key];
                  return (
                    <div
                      key={p.key}
                      className="abnormality-card"
                      style={{ borderLeftColor: classifyNamed(st) }}
                    >
                      <div className="abnormality-top">
                        <div className="abnormality-title">
                          <AlertTriangle size={18} style={{ color: classifyNamed(st) }} />
                          <strong>{p.label} Breach</strong>
                          <span className="abnormality-reading">
                            Recorded: {val} {p.unit}
                          </span>
                        </div>
                        <StatusBadge status={st} />
                      </div>
                      <p className="abnormality-desc">
                        {explainAbnormality(p.key, val, st, thresholds)}
                      </p>
                      <div className="abnormality-action">
                        <ArrowRight size={14} />
                        <span>
                          Automated Action:{' '}
                          {st === 'Critical' || st === 'Poor'
                            ? 'Ultrasonic cavitation pulse sequence engaged to disrupt algal cell walls and disperse suspended particulates.'
                            : 'Logged in edge buffer; continuous telemetry monitoring for further degradation.'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Mandatory Engineering & Environmental Disclaimer */}
          <div className="disclaimer-banner">
            <div className="disclaimer-icon">
              <ShieldAlert size={22} color="#0891b2" />
            </div>
            <div className="disclaimer-content">
              <h4 className="disclaimer-title">Drinking Water Safety & Compliance Notice</h4>
              <p className="disclaimer-text">
                This analysis evaluates physical and electrochemical indicators (pH, optical turbidity,
                temperature, and total dissolved solids) to monitor aquatic ecosystem balance and trigger
                edge-driven ultrasonic revitalization. <strong>Do not claim that water is safe for drinking based only on these sensors.</strong>{' '}
                Comprehensive potability certification mandates laboratory testing for microbiological pathogens
                (E. coli, enterococci), toxic cyanotoxins, synthetic chemical runoff, and heavy metals.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
