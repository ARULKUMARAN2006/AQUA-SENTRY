import React from 'react';
import StatusBadge from './StatusBadge';
import StatusDot from './StatusDot';
import { useSensors } from '../context/SensorContext';
import { Waves, Zap, Info, Clock, CheckCircle } from 'lucide-react';

export default function RevitalizationPanel() {
  const { treatment, overall, statuses, lastTreatment, treatmentCycles } =
    useSensors();

  const abnormalParams = Object.entries(statuses).filter(([, s]) => s !== 'Good');
  const isTreating = treatment.state === 'Active';

  return (
    <section className="section panel revitalization-panel">
      <div className="rev-header-bar">
        <div className="rev-title-group">
          <Waves size={20} className="cyan-icon" />
          <h2 className="section-title no-margin">Intelligent Aquatic Revitalization</h2>
        </div>
        <div className="rev-header-badges">
          <span className="sim-badge">Simulated Edge Logic</span>
          <span className="hw-state-tag">ESP32 Acoustic Subassembly</span>
        </div>
      </div>

      <p className="rev-intro-text">
        Automated edge mitigation system: detects microalgal proliferation and suspended colloidal particles,
        initiating selective ultrasonic cavitation to disrupt algal gas vacuoles and settle particulates without
        chemical additives.
      </p>

      {/* Requirement 7 Key Displays:
          1. Current revitalization status
          2. Ultrasonic treatment status
          3. Water quality condition
          4. Reason for treatment activation or deactivation
          Display whether treatment is Active, Inactive, or Standby.
      */}
      <div className="rev-core-grid">
        <div className="rev-core-card">
          <span className="rev-card-label">Revitalization Status</span>
          <div className="rev-status-row">
            <StatusDot status={treatment.state} />
            <StatusBadge status={treatment.state} />
          </div>
          <span className="rev-subtext">Automated Edge Pipeline</span>
        </div>

        <div className="rev-core-card">
          <span className="rev-card-label">Ultrasonic Treatment</span>
          <div className="rev-status-row">
            <StatusDot status={treatment.state} />
            <StatusBadge status={treatment.state} />
          </div>
          <span className="rev-subtext">
            {isTreating ? '28 kHz Cavitation Emitting' : 'Transducers Idle'}
          </span>
        </div>

        <div className="rev-core-card">
          <span className="rev-card-label">Water Quality Condition</span>
          <div className="rev-status-row">
            <StatusDot status={overall} />
            <StatusBadge status={overall} />
          </div>
          <span className="rev-subtext">Threshold Discriminator</span>
        </div>

        <div className="rev-core-card">
          <span className="rev-card-label">Cycles Completed</span>
          <div className="rev-cycles-val">
            <Zap size={16} className="yellow-icon" />
            <strong>{treatmentCycles}</strong>
            <span className="cycles-unit">Restoration Cycles</span>
          </div>
          <span className="rev-subtext">Autonomous Interventions</span>
        </div>
      </div>

      {/* Reason for treatment activation or deactivation */}
      <div className={`rev-reason-box ${treatment.state.toLowerCase()}`}>
        <div className="reason-top-row">
          <Info size={16} className="reason-icon" />
          <strong>Reason for Current Treatment State ({treatment.state}):</strong>
        </div>
        <p className="reason-text">{treatment.reason}</p>
        <div className="reason-context">
          {abnormalParams.length > 0 ? (
            <span className="param-alert-note">
              Triggering parameter breach:{' '}
              <strong>
                {abnormalParams.map(([k, s]) => `${k.toUpperCase()} (${s})`).join(', ')}
              </strong>
            </span>
          ) : (
            <span className="param-good-note">
              <CheckCircle size={14} className="inline-icon" />
              All parameters currently meet configured project thresholds.
            </span>
          )}
        </div>
      </div>

      {/* Ultrasonic Technical Parameters */}
      <div className="rev-tech-grid">
        <div className="tech-item">
          <span className="tech-label">Ultrasonic Frequency</span>
          <strong className="tech-val">28.0 kHz</strong>
          <span className="tech-sub">Algae lysis & cavitation</span>
        </div>
        <div className="tech-item">
          <span className="tech-label">Acoustic Power</span>
          <strong className="tech-val">{isTreating ? '60 Watts' : '0 Watts (Idle)'}</strong>
          <span className="tech-sub">Dual transducer array</span>
        </div>
        <div className="tech-item">
          <span className="tech-label">Cavitation Mode</span>
          <strong className="tech-val">{isTreating ? 'Continuous Pulse' : 'Standby'}</strong>
          <span className="tech-sub">Mechanical resonance</span>
        </div>
        <div className="tech-item">
          <span className="tech-label">Chemical Additives</span>
          <strong className="tech-val">0% (Pure Physical)</strong>
          <span className="tech-sub">Non-toxic eco-preservation</span>
        </div>
      </div>

      {/* Last Treatment Cycle Results */}
      {lastTreatment && (
        <div className="rev-last-treatment-box">
          <div className="last-t-header">
            <Clock size={15} />
            <span>
              Last Restoration Cycle Verified at{' '}
              {new Date(lastTreatment.endedAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="last-t-body">
            <span>
              Turbidity improved from{' '}
              <strong className="bad-txt">{lastTreatment.before?.turbidity} NTU</strong> to{' '}
              <strong className="good-txt">{lastTreatment.after?.turbidity} NTU</strong>
            </span>
            <span className="pipe-sep">|</span>
            <span>
              TDS shifted from{' '}
              <strong>{lastTreatment.before?.tds} ppm</strong> to{' '}
              <strong>{lastTreatment.after?.tds} ppm</strong>
            </span>
            <span className="pipe-sep">|</span>
            <span>
              Condition transitioned from <strong>{lastTreatment.beforeOverall}</strong> to{' '}
              <strong>{lastTreatment.afterOverall}</strong>
            </span>
          </div>
        </div>
      )}

      <p className="disclaimer-mini">
        Notice: The revitalization process displayed above is driven by simulated edge telemetry for demonstration
        purposes. No physical high-power ultrasonic transducers are attached.
      </p>
    </section>
  );
}
