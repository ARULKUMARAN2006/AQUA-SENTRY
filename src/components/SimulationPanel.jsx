import React from 'react';
import { Play, Pause, FlaskConical, WifiOff, Zap } from 'lucide-react';
import { useSensors } from '../context/SensorContext';
import { UNITS, PHASE, PHASE_COPY } from '../data/simulation';

const STEPS = [
  { stage: 1, key: PHASE.MONITORING, label: '1 · Robot patrolling & monitoring' },
  { stage: 2, key: PHASE.DEGRADING, label: '2 · Contamination event' },
  { stage: 3, key: PHASE.TREATING, label: '3 · Ultrasonic treatment' },
  { stage: 4, key: 'Recovered', label: '4 · Water quality improved' },
];

const STATUS_TONE = {
  Good: 'ok',
  Moderate: 'warn',
  Poor: 'bad',
  Critical: 'bad',
  Unknown: 'off',
};

const ULTRASONIC_TONE = {
  OFF: 'off',
  ON: 'ok',
  PROCESSING: 'ok',
};

export default function SimulationPanel() {
  const {
    readings, statuses, phase, progress, treatmentCycles, severeEvents, lastTreatment,
    paused, setPaused, triggerEvent, forcePhase, connectionStatus,
    treatmentStatus, stage,
  } = useSensors();

  const phaseClass = phase === PHASE.TREATING ? 'treat' : phase === PHASE.DEGRADING ? 'degrade' : 'ok';
  const algaeReductionPct = treatmentStatus.algaeReductionPct;

  return (
    <section className="section panel sim-panel">
      <div className="rev-header">
        <h2 className="section-title">
          <FlaskConical size={16} className="inline-icon" /> System Simulation
        </h2>
        <span className="sim-badge"><WifiOff size={12} /> {connectionStatus} IoT source</span>
      </div>

      <p className="sim-intro">
        The operating cycle is simulated in the browser: the robot patrols and the sensors read the water, a
        contamination event develops, the ESP32 edge logic detects the threshold breach, the ultrasonic unit runs, and
        the readings recover. Every value below is generated — nothing here controls real hardware.
      </p>

      <div className="cycle-strip">
        {STEPS.map((s) => {
          const active = stage === s.stage;
          return (
            <button
              type="button"
              className={`cycle-step ${active ? 'active' : ''}`}
              key={s.key}
              onClick={() => forcePhase(s.stage)}
              title={`Jump to stage: ${s.label}`}
            >
              <span className="cycle-label">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className={`sim-state-box ${phaseClass}`}>
        <div className="sim-state-head">
          <span className="sim-phase">Current phase: <strong>{phase}</strong></span>
          <span className="sim-phase-note">{PHASE_COPY[phase]}</span>
        </div>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        {/* Ultrasonic treatment status + algae data */}
        <div className="sim-treatment-row">
          <span className="sim-treatment-label">
            Ultrasonic treatment:
            <span className={`sim-treatment-status ${ULTRASONIC_TONE[treatmentStatus.status] || 'off'}`}>
              {treatmentStatus.status}
            </span>
          </span>
          <span className="sim-treatment-progress">
            Treatment progress {Math.round(treatmentStatus.progress)}%
          </span>
        </div>

        <div className="sim-algae-row">
          <span className="sim-algae-label">Algae (simulated):</span>
          <span className="sim-algae-value">
            Initial <b>{treatmentStatus.algaeInitial}</b> · Current <b>{treatmentStatus.algaeCurrent}</b> ·
            Reduction <b>{algaeReductionPct}%</b>
          </span>
          <span className="sim-algae-note">Simulation only — illustrative values, not real measurements.</span>
        </div>

        <div className="sim-controls">
          <button className="sim-btn" onClick={() => setPaused(!paused)}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
            {paused ? 'Resume simulation' : 'Pause simulation'}
          </button>
          <button className="sim-btn warn" onClick={triggerEvent} disabled={phase !== PHASE.MONITORING}>
            <Zap size={15} />
            Simulate contamination event
          </button>
          <span className="sim-state">
            {paused ? 'Simulation paused' : 'Live tick every 3s'}
            {' · '}treatments completed: {treatmentCycles}
            {severeEvents > 0 ? ` (${severeEvents} severe)` : ''}
          </span>
        </div>
      </div>

      <div className="sim-readings">
        {Object.keys(readings).map((k) => (
          <div className="sim-reading" key={k}>
            <span className="sim-reading-label">{k}</span>
            <span className="sim-reading-value">
              {readings[k] == null ? 'offline' : `${readings[k]}${UNITS[k] ? ` ${UNITS[k]}` : ''}`}
            </span>
            <span className={`sim-reading-status ${STATUS_TONE[statuses[k]] || 'ok'}`}>{statuses[k]}</span>
          </div>
        ))}
      </div>

      <p className="sim-readings-note">
        All readings are generated by the simulation. The TDS (DS) rise while the ultrasonic unit runs is a
        simulated behaviour, not measured chemistry, and is not a claim of real-world treatment effectiveness.
      </p>

      {lastTreatment && (
        <div className="sim-result">
          <span className="rev-label">
            Last treatment result (simulated){lastTreatment.severe ? ' — severe event' : ''}
          </span>
          <div className="table-wrap">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Before treatment</th>
                  <th>After treatment</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(readings).map((k) => {
                  const b = lastTreatment.before?.[k];
                  const a = lastTreatment.after?.[k];
                  if (b == null || a == null) return null;
                  const delta = +(a - b).toFixed(2);
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="before">{b}{UNITS[k] ? ` ${UNITS[k]}` : ''}</td>
                      <td className="after">{a}{UNITS[k] ? ` ${UNITS[k]}` : ''}</td>
                      <td className={delta <= 0 ? 'good-txt' : 'bad-txt'}>
                        {delta > 0 ? '+' : ''}{delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="rev-sub">
            Water quality went from <strong>{lastTreatment.beforeOverall}</strong> to{' '}
            <strong>{lastTreatment.afterOverall}</strong> after the ultrasonic unit ran.
          </p>
        </div>
      )}
    </section>
  );
}
