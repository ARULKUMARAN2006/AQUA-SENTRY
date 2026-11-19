import React from 'react';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import StatusDot from '../components/StatusDot';
import RevitalizationPanel from '../components/RevitalizationPanel';
import { useSensors } from '../context/SensorContext';
import { Bot, Cpu, Waves } from 'lucide-react';

const THRUSTERS = [
  'Front Left Thruster',
  'Front Right Thruster',
  'Rear Left Thruster',
  'Rear Right Thruster',
];

function RobotSchematic({ thrusters, treatmentState }) {
  const isFLActive = thrusters['Front Left Thruster'] === 'Active';
  const isFRActive = thrusters['Front Right Thruster'] === 'Active';
  const isRLActive = thrusters['Rear Left Thruster'] === 'Active';
  const isRRActive = thrusters['Rear Right Thruster'] === 'Active';

  const isFLFault = thrusters['Front Left Thruster'] === 'Fault';
  const isFRFault = thrusters['Front Right Thruster'] === 'Fault';
  const isRLFault = thrusters['Rear Left Thruster'] === 'Fault';
  const isRRFault = thrusters['Rear Right Thruster'] === 'Fault';

  const isTreating = treatmentState === 'Active';

  const getThrusterFill = (status) => {
    if (status === 'Active') return '#16a34a';
    if (status === 'Fault') return '#ef4444';
    return '#64748b';
  };

  return (
    <div className="schematic-container">
      <svg
        viewBox="0 0 400 480"
        className="robot-svg"
        role="img"
        aria-label="Aquatic Robot Catamaran Schematic View"
      >
        <defs>
          <linearGradient id="hullGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="pontoonGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="deckGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Water background ripples */}
        <circle cx="200" cy="240" r="180" fill="none" stroke="#e0f2fe" strokeWidth="1.5" strokeDasharray="6 6" />
        <circle cx="200" cy="240" r="140" fill="none" stroke="#bae6fd" strokeWidth="1.5" strokeDasharray="4 4" />

        {/* Left Pontoon */}
        <path
          d="M 100 80 Q 90 220 95 380 Q 105 400 120 380 Q 130 220 125 80 Q 115 60 100 80 Z"
          fill="url(#pontoonGrad)"
          stroke="#475569"
          strokeWidth="2"
        />

        {/* Right Pontoon */}
        <path
          d="M 300 80 Q 310 220 305 380 Q 295 400 280 380 Q 270 220 275 80 Q 285 60 300 80 Z"
          fill="url(#pontoonGrad)"
          stroke="#475569"
          strokeWidth="2"
        />

        {/* Center Cross Deck */}
        <rect
          x="120"
          y="140"
          width="160"
          height="180"
          rx="18"
          fill="url(#hullGrad)"
          stroke="#0891b2"
          strokeWidth="2.5"
        />

        {/* Forward Sensor Probe Bay */}
        <path
          d="M 150 140 Q 200 100 250 140 Z"
          fill="#0e7490"
          stroke="#22d3ee"
          strokeWidth="1.5"
        />
        <circle cx="175" cy="125" r="4" fill="#22c55e" title="pH Sensor" />
        <circle cx="192" cy="118" r="4" fill="#eab308" title="Turbidity Sensor" />
        <circle cx="208" cy="118" r="4" fill="#f97316" title="Temperature Sensor" />
        <circle cx="225" cy="125" r="4" fill="#06b6d4" title="TDS Sensor" />
        <text x="200" y="92" textAnchor="middle" fill="#0891b2" fontSize="9" fontWeight="700">
          PROBE BAY
        </text>

        {/* Central Ultrasonic Transducer Subassembly */}
        <rect
          x="160"
          y="200"
          width="80"
          height="65"
          rx="12"
          fill="#164e63"
          stroke={isTreating ? '#22d3ee' : '#64748b'}
          strokeWidth="2"
        />
        <circle
          cx="200"
          cy="232"
          r="16"
          fill={isTreating ? '#06b6d4' : '#334155'}
          filter={isTreating ? 'url(#glowCyan)' : undefined}
        />
        <text
          x="200"
          y="236"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="9"
          fontWeight="700"
        >
          {isTreating ? '28 kHz' : 'OFF'}
        </text>
        <text
          x="200"
          y="256"
          textAnchor="middle"
          fill={isTreating ? '#67e8f9' : '#94a3b8'}
          fontSize="8"
          fontWeight="600"
        >
          ULTRASONIC
        </text>

        {/* Ultrasonic Radiation Wave Visual (if treating) */}
        {isTreating && (
          <>
            <circle cx="200" cy="232" r="32" fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.8" />
            <circle cx="200" cy="232" r="48" fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity="0.5" strokeDasharray="5 3" />
            <circle cx="200" cy="232" r="64" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.3" strokeDasharray="3 3" />
          </>
        )}

        {/* ESP32 Gateway Enclosure */}
        <rect
          x="165"
          y="280"
          width="70"
          height="32"
          rx="6"
          fill="#0f172a"
          stroke="#06b6d4"
          strokeWidth="1.5"
        />
        <circle cx="178" cy="296" r="3.5" fill="#22c55e" />
        <text x="204" y="299" textAnchor="middle" fill="#f8fafc" fontSize="9" fontWeight="700">
          ESP32 EDGE
        </text>

        {/* Thruster 1: Front Left (FL) */}
        <g transform="translate(68, 100)">
          <rect
            x="0"
            y="0"
            width="28"
            height="44"
            rx="6"
            fill={getThrusterFill(thrusters['Front Left Thruster'])}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <text x="14" y="26" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="700">
            FL
          </text>
          {isFLActive && (
            <path d="M 14 -12 L 14 -2 M 9 -6 L 14 -12 L 19 -6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
          )}
          {isFLFault && (
            <text x="14" y="-4" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="800">!</text>
          )}
        </g>

        {/* Thruster 2: Front Right (FR) */}
        <g transform="translate(304, 100)">
          <rect
            x="0"
            y="0"
            width="28"
            height="44"
            rx="6"
            fill={getThrusterFill(thrusters['Front Right Thruster'])}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <text x="14" y="26" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="700">
            FR
          </text>
          {isFRActive && (
            <path d="M 14 -12 L 14 -2 M 9 -6 L 14 -12 L 19 -6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
          )}
          {isFRFault && (
            <text x="14" y="-4" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="800">!</text>
          )}
        </g>

        {/* Thruster 3: Rear Left (RL) */}
        <g transform="translate(68, 330)">
          <rect
            x="0"
            y="0"
            width="28"
            height="44"
            rx="6"
            fill={getThrusterFill(thrusters['Rear Left Thruster'])}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <text x="14" y="26" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="700">
            RL
          </text>
          {isRLActive && (
            <path d="M 14 56 L 14 46 M 9 50 L 14 56 L 19 50" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
          )}
          {isRLFault && (
            <text x="14" y="58" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="800">!</text>
          )}
        </g>

        {/* Thruster 4: Rear Right (RR) */}
        <g transform="translate(304, 330)">
          <rect
            x="0"
            y="0"
            width="28"
            height="44"
            rx="6"
            fill={getThrusterFill(thrusters['Rear Right Thruster'])}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <text x="14" y="26" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="700">
            RR
          </text>
          {isRRActive && (
            <path d="M 14 56 L 14 46 M 9 50 L 14 56 L 19 50" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
          )}
          {isRRFault && (
            <text x="14" y="58" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="800">!</text>
          )}
        </g>
      </svg>
      <div className="schematic-caption">
        <strong>Autonomous Surface Vessel (ASV) Catamaran Layout</strong>
        <span>Schematic visualization of simulated actuator telemetry and probe placement</span>
      </div>
    </div>
  );
}

export default function RobotStatus({ onMenuToggle, onOpenThresholds }) {
  const {
    robot,
    treatment,
    overall,
    phase,
    connectionStatus,
    diagnosticOverride,
    setDiagnosticOverride,
  } = useSensors();

  const setThrusterStatus = (thruster, status) => {
    const currentStatuses = diagnosticOverride && typeof diagnosticOverride === 'object'
      ? diagnosticOverride
      : robot.thrusters;

    setDiagnosticOverride({
      ...currentStatuses,
      [thruster]: status,
    });
  };

  return (
    <div className="page">
      <Header
        title="Robot Status & Telemetry"
        subtitle={`Autonomous aquatic surface vessel diagnostics · Phase: ${phase}`}
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />

      <div className="robot-dashboard-grid">
        {/* Left Column: Robot SVG Schematic */}
        <div className="panel robot-schematic-panel">
          <div className="panel-header-row">
            <h2 className="section-title">
              <Bot size={18} className="cyan-icon" /> Vessel Architectural Schematic
            </h2>
            <span className="mode-pill">{robot.mode}</span>
          </div>

          <RobotSchematic
            thrusters={robot.thrusters}
            treatmentState={treatment.state}
            mode={robot.mode}
          />

          {/* Test State Selector to verify Active, Inactive, Fault states */}
          <div className="demo-state-box">
            <span className="demo-state-title">Actuator Status Controls:</span>
            <div className="demo-state-buttons">
              <button
                type="button"
                className={`demo-btn ${diagnosticOverride === null ? 'active' : ''}`}
                onClick={() => setDiagnosticOverride(null)}
              >
                Normal Auto Cycle
              </button>
              <button
                type="button"
                className={`demo-btn ${diagnosticOverride === 'fault' ? 'active' : ''}`}
                onClick={() => setDiagnosticOverride('fault')}
              >
                Thruster 4 Fault Test
              </button>
              <button
                type="button"
                className={`demo-btn ${diagnosticOverride === 'docked' ? 'active' : ''}`}
                onClick={() => setDiagnosticOverride('docked')}
              >
                All Thrusters Inactive
              </button>
            </div>
            <span className="demo-state-hint">
              Choose the status of each thruster below. These controls update the simulated dashboard only.
            </span>
          </div>
        </div>

        {/* Right Column: Thruster Telemetry & Module Indicators */}
        <div className="robot-telemetry-column">
          {/* Module Statuses: ESP32, Ultrasonic, Mode */}
          <div className="panel modules-panel">
            <h2 className="section-title">
              <Cpu size={18} className="cyan-icon" /> Core Edge Modules
            </h2>
            <div className="module-rows">
              <div className="module-row">
                <div className="module-info">
                  <span className="module-name">ESP32 Edge Microcontroller</span>
                  <span className="module-sub">Gateway Firmware v2.4 (Edge FreeRTOS Loop)</span>
                </div>
                <div className="module-status">
                  <StatusBadge status="Active" />
                  <span className="hw-subtext">Simulation Loop</span>
                </div>
              </div>

              <div className="module-row">
                <div className="module-info">
                  <span className="module-name">Ultrasonic Cavitation Transducer</span>
                  <span className="module-sub">Acoustic Subassembly: 28 kHz / 60W</span>
                </div>
                <div className="module-status">
                  <StatusBadge status={treatment.state} />
                  <span className="hw-subtext">Edge Automated</span>
                </div>
              </div>

              <div className="module-row">
                <div className="module-info">
                  <span className="module-name">Current Operating Mode</span>
                  <span className="module-sub">Autonomous Navigation Vector</span>
                </div>
                <span className="mode-pill">{robot.mode}</span>
              </div>

              <div className="module-row">
                <div className="module-info">
                  <span className="module-name">Water Quality Trigger Index</span>
                  <span className="module-sub">Edge threshold breach discriminator</span>
                </div>
                <StatusBadge status={overall} />
              </div>
            </div>
          </div>

          {/* Four Thrusters Telemetry Table */}
          <div className="panel thrusters-panel">
            <h2 className="section-title">
              <Waves size={18} className="cyan-icon" /> Propulsion Thruster Array (4 Channels)
            </h2>
            <div className="thruster-cards-grid">
              {THRUSTERS.map((t) => {
                const thrusterData = robot.telemetry?.[t] || {
                  status: robot.thrusters[t] || 'Inactive',
                  pwm: 0,
                  rpm: 0,
                  current: '0.0 A',
                };
                const st = thrusterData.status;
                return (
                  <div className={`thruster-card ${st.toLowerCase()}`} key={t}>
                    <div className="t-card-top">
                      <span className="t-name">{t}</span>
                      <div className="t-status-group">
                        <StatusDot status={st} />
                        <StatusBadge status={st} />
                      </div>
                    </div>
                    <div className="t-metrics-grid">
                      <div className="t-metric">
                        <span className="t-m-label">PWM Output</span>
                        <span className="t-m-val">{thrusterData.pwm}%</span>
                      </div>
                      <div className="t-metric">
                        <span className="t-m-label">Shaft RPM</span>
                        <span className="t-m-val">{thrusterData.rpm}</span>
                      </div>
                      <div className="t-metric">
                        <span className="t-m-label">Bus Current</span>
                        <span className="t-m-val">{thrusterData.current}</span>
                      </div>
                    </div>
                    <div className="thruster-status-controls" aria-label={`Set ${t} status`}>
                      {['Active', 'Inactive', 'Fault'].map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`thruster-status-btn ${st === status ? 'selected' : ''} ${status.toLowerCase()}`}
                          onClick={() => setThrusterStatus(t, status)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Revitalization Detailed Panel */}
      <RevitalizationPanel />

      {/* State Legend */}
      <section className="section">
        <h2 className="section-title">Actuator & Module Status Legend</h2>
        <div className="legend-pills-row">
          <div className="legend-item">
            <StatusBadge status="Active" />
            <span>Active: Module operating normally in patrol or cavitation cycle</span>
          </div>
          <div className="legend-item">
            <StatusBadge status="Standby" />
            <span>Standby: Module armed, awaiting threshold breach condition</span>
          </div>
          <div className="legend-item">
            <StatusBadge status="Inactive" />
            <span>Inactive: Powered down or holding stationary position</span>
          </div>
          <div className="legend-item">
            <StatusBadge status="Fault" />
            <span>Fault: Actuator stall, overcurrent, or signal breach</span>
          </div>
        </div>
      </section>
    </div>
  );
}
