import React, { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { RotateCcw, Save, FlaskConical, Target, Zap } from 'lucide-react';
import {
  DEFAULT_TREATMENT_PARAMETERS,
  MODEL_CONFIG,
  OPTIMIZATION_OBJECTIVES,
  createStrategies,
  normaliseTreatmentParameters,
  optimiseTreatment,
  simulateTreatment,
} from '../data/treatmentModel';
import { useSensors } from '../context/SensorContext';

const INPUT_FIELDS = [
  ['initialAlgae', 'Initial algae concentration', 'mg/L', 0, 100000, 1],
  ['frequency', 'Ultrasonic frequency', 'kHz', 10, 100, 1],
  ['power', 'Ultrasonic power', 'W', 0, 500, 1],
  ['duration', 'Treatment duration', 'min', 1, 240, 1],
  ['dutyCycle', 'Duty cycle', '%', 1, 100, 1],
  ['volume', 'Water volume', 'L', 1, 100000, 1],
  ['turbidity', 'Initial water turbidity', 'NTU', 0, 1000, 0.1],
  ['targetReduction', 'Target algae reduction', '%', 0, 99.9, 0.1],
];

const formatNumber = (value, digits = 2) => Number(value).toFixed(digits);

function NumberField({ field, value, onChange }) {
  const [key, label, unit, min, max, step] = field;
  return (
    <label className="studio-field">
      <span>{label} <small>({unit})</small></span>
      <div className="studio-input-wrap">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(key, event.target.value)}
        />
        <span>{unit}</span>
      </div>
    </label>
  );
}

function Metric({ label, value, unit }) {
  return (
    <div className="studio-metric">
      <span>{label}</span>
      <strong>{value} <small>{unit}</small></strong>
    </div>
  );
}

function TreatmentResults({ result }) {
  return (
    <div className="studio-result-grid">
      <Metric label="Predicted reduction" value={formatNumber(result.predictedReduction, 1)} unit="%" />
      <Metric label="Remaining algae" value={formatNumber(result.remainingAlgae, 2)} unit="mg/L" />
      <Metric label="Energy estimate" value={formatNumber(result.energyKwh, 4)} unit="kWh" />
      <Metric label="Treatment cost" value={`$${formatNumber(result.estimatedCost, 4)}`} unit={`at $${MODEL_CONFIG.referenceTariff}/kWh`} />
    </div>
  );
}

function ScenarioChart({ result }) {
  return (
    <div className="studio-chart-card studio-chart-stack">
      <div className="studio-chart-panel">
        <h4 className="studio-chart-title">Remaining algae concentration (mg/L)</h4>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={result.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="minutes" tick={{ fontSize: 11 }} unit=" min" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${value} mg/L`, 'Remaining algae']} />
            <Line type="monotone" dataKey="algae" name="Remaining algae" stroke="#06b6d4" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="studio-chart-panel">
        <h4 className="studio-chart-title">Algae reduction (%)</h4>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={result.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="minutes" tick={{ fontSize: 11 }} unit=" min" />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip formatter={(value) => [`${value}%`, 'Reduction']} />
            <Line type="monotone" dataKey="reduction" name="Reduction" stroke="#22c55e" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TreatmentStudio() {
  const { readings } = useSensors();
  const [tab, setTab] = useState('simulator');
  const [parameters, setParameters] = useState(() => ({
    ...DEFAULT_TREATMENT_PARAMETERS,
    turbidity: readings.turbidity ?? DEFAULT_TREATMENT_PARAMETERS.turbidity,
  }));
  const [result, setResult] = useState(() => simulateTreatment(parameters));
  const [scenarios, setScenarios] = useState([]);
  const [strategies, setStrategies] = useState(() => createStrategies(parameters));
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [strategyObjective, setStrategyObjective] = useState('reduction');
  const [optimization, setOptimization] = useState({
    initialAlgae: parameters.initialAlgae,
    targetReduction: 70,
    maxPower: 150,
    maxDuration: 60,
    minFrequency: 18,
    maxFrequency: 40,
    maxEnergy: 0.2,
    volume: parameters.volume,
    turbidity: parameters.turbidity,
  });
  const [objective, setObjective] = useState('balanced');
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [optimizationHistory, setOptimizationHistory] = useState([]);

  const updateParameter = (key, value) => {
    setParameters((current) => ({ ...current, [key]: value === '' ? '' : Number(value) }));
  };

  const runSimulation = () => {
    const next = simulateTreatment(normaliseTreatmentParameters(parameters));
    setParameters(next.parameters);
    setResult(next);
  };

  const resetSimulation = () => {
    const next = {
      ...DEFAULT_TREATMENT_PARAMETERS,
      turbidity: readings.turbidity ?? DEFAULT_TREATMENT_PARAMETERS.turbidity,
    };
    setParameters(next);
    setResult(simulateTreatment(next));
    setSelectedStrategy(null);
  };

  const saveScenario = () => {
    const scenario = {
      id: Date.now(),
      name: `Scenario ${scenarios.length + 1}`,
      parameters: result.parameters,
      result,
    };
    setScenarios((current) => [scenario, ...current].slice(0, 8));
  };

  const loadParameters = (next) => {
    const normalised = normaliseTreatmentParameters(next);
    setParameters(normalised);
    setResult(simulateTreatment(normalised));
    setTab('simulator');
  };

  const runStrategies = () => {
    setStrategies(createStrategies(normaliseTreatmentParameters(parameters)));
    setTab('strategies');
  };

  const runOptimization = () => {
    const next = optimiseTreatment(optimization, objective);
    setOptimizationResult(next);
    if (next.selected) {
      setOptimizationHistory((current) => [{
        id: Date.now(),
        objective,
        result: next.selected,
      }, ...current].slice(0, 8));
    }
  };

  const strategyChart = useMemo(() => strategies.map((strategy) => ({
    name: strategy.name.replace('Strategy ', '').split(' — ')[0],
    reduction: strategy.result.predictedReduction,
    energy: +(strategy.result.energyKwh * 1000).toFixed(2),
    efficiency: strategy.result.energyKwh > 0
      ? +(strategy.result.predictedReduction / strategy.result.energyKwh).toFixed(1)
      : 0,
  })), [strategies]);
  const bestStrategy = useMemo(() => {
    if (!strategies.length) return null;
    return [...strategies].sort((a, b) => {
      if (strategyObjective === 'energy') return a.result.energyKwh - b.result.energyKwh;
      if (strategyObjective === 'efficiency') {
        return (b.result.predictedReduction / Math.max(b.result.energyKwh, 0.0001))
          - (a.result.predictedReduction / Math.max(a.result.energyKwh, 0.0001));
      }
      return b.result.predictedReduction - a.result.predictedReduction;
    })[0];
  }, [strategies, strategyObjective]);

  return (
    <section className="section panel treatment-studio">
      <div className="studio-header">
        <div>
          <h2 className="section-title"><FlaskConical size={17} className="inline-icon" /> Advanced Stimulation Studio</h2>
          <p className="studio-intro">
            Preliminary software model for comparing ultrasonic treatment conditions. Results are simulated predictions,
            not experimentally validated algae removal.
          </p>
        </div>
        <span className="sim-badge">Configurable model · {MODEL_CONFIG.referenceTariff}/kWh tariff</span>
      </div>

      <div className="studio-tabs" role="tablist" aria-label="Treatment studio modules">
        {[
          ['simulator', 'What-If Simulator'],
          ['strategies', 'Strategy Comparison'],
          ['optimizer', 'Treatment Optimization'],
        ].map(([key, label]) => (
          <button key={key} type="button" className={`studio-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'simulator' && (
        <div className="studio-content">
          <div className="studio-input-layout">
            <div className="studio-fields">
              {INPUT_FIELDS.map((field) => (
                <NumberField key={field[0]} field={field} value={parameters[field[0]]} onChange={updateParameter} />
              ))}
              <div className="studio-actions">
                <button type="button" className="sim-btn" onClick={runSimulation}><Zap size={14} /> Run simulation</button>
                <button type="button" className="sim-btn" onClick={saveScenario}><Save size={14} /> Save scenario</button>
                <button type="button" className="sim-btn" onClick={resetSimulation}><RotateCcw size={14} /> Reset</button>
                <button type="button" className="sim-btn" onClick={runStrategies}>Generate strategies</button>
              </div>
            </div>
            <div>
              <TreatmentResults result={result} />
              <ScenarioChart result={result} />
            </div>
          </div>

          <div className="studio-note">
            <strong>Model assumptions:</strong> {result.assumptions.join(' ')}
          </div>

          {scenarios.length > 0 && (
            <div className="studio-table-wrap">
              <h3 className="studio-subtitle">Saved scenario comparison</h3>
              <table className="data-table">
                <thead><tr><th>Scenario</th><th>Frequency</th><th>Power</th><th>Duration</th><th>Reduction</th><th>Energy</th><th /></tr></thead>
                <tbody>
                  {scenarios.map((scenario) => (
                    <tr key={scenario.id}>
                      <td>{scenario.name}</td>
                      <td>{scenario.parameters.frequency} kHz</td>
                      <td>{scenario.parameters.power} W</td>
                      <td>{scenario.parameters.duration} min</td>
                      <td>{scenario.result.predictedReduction}%</td>
                      <td>{scenario.result.energyKwh} kWh</td>
                      <td><button type="button" className="link-btn" onClick={() => loadParameters(scenario.parameters)}>Load</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'strategies' && (
        <div className="studio-content">
          <div className="studio-actions strategy-actions">
            <button type="button" className="sim-btn" onClick={runStrategies}><Target size={14} /> Recalculate strategies</button>
            {selectedStrategy && <button type="button" className="sim-btn" onClick={() => loadParameters(selectedStrategy.parameters)}>Load selected into simulator</button>}
            <label className="studio-inline-select">
              Best strategy by
              <select value={strategyObjective} onChange={(event) => setStrategyObjective(event.target.value)}>
                <option value="reduction">predicted reduction</option>
                <option value="energy">lowest energy</option>
                <option value="efficiency">reduction per kWh</option>
              </select>
            </label>
          </div>
          {bestStrategy && (
            <div className="studio-note studio-success">
              Best for the selected objective: <strong>{bestStrategy.name}</strong> ({bestStrategy.result.predictedReduction}% predicted reduction, {bestStrategy.result.energyKwh} kWh).
            </div>
          )}
          <div className="studio-chart-grid">
            <div className="studio-chart-card"><ResponsiveContainer width="100%" height={240}><BarChart data={strategyChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="reduction" name="Reduction (%)" fill="#22c55e" /></BarChart></ResponsiveContainer></div>
            <div className="studio-chart-card"><ResponsiveContainer width="100%" height={240}><BarChart data={strategyChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="energy" name="Energy (Wh)" fill="#f97316" /></BarChart></ResponsiveContainer></div>
            <div className="studio-chart-card"><ResponsiveContainer width="100%" height={240}><BarChart data={strategyChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="efficiency" name="Reduction per kWh" fill="#06b6d4" /></BarChart></ResponsiveContainer></div>
          </div>
          <div className="studio-table-wrap">
            <table className="data-table">
              <thead><tr><th>Strategy</th><th>Frequency</th><th>Power</th><th>Duration</th><th>Duty</th><th>Reduction</th><th>Remaining</th><th>Energy</th><th /></tr></thead>
              <tbody>
                {strategies.map((strategy) => (
                  <tr key={strategy.id} className={selectedStrategy?.id === strategy.id ? 'studio-selected-row' : ''}>
                    <td><strong>{strategy.name}</strong><br /><small>{strategy.objective}</small></td>
                    <td>{strategy.parameters.frequency} kHz</td>
                    <td>{strategy.parameters.power} W</td>
                    <td>{strategy.parameters.duration} min</td>
                    <td>{strategy.parameters.dutyCycle}%</td>
                    <td>{strategy.result.predictedReduction}%</td>
                    <td>{strategy.result.remainingAlgae} mg/L</td>
                    <td>{strategy.result.energyKwh} kWh</td>
                    <td><button type="button" className="link-btn" onClick={() => setSelectedStrategy(strategy)}>Select</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="studio-note">These are deterministic algorithmic strategies using the shared response model; they are not machine-learning predictions.</p>
        </div>
      )}

      {tab === 'optimizer' && (
        <div className="studio-content">
          <div className="studio-input-layout">
            <div className="studio-fields">
              {[
                ['initialAlgae', 'Initial algae', 'mg/L', 0, 100000, 1],
                ['targetReduction', 'Desired reduction', '%', 0, 99.9, 0.1],
                ['maxPower', 'Maximum power', 'W', 1, 500, 1],
                ['maxDuration', 'Maximum duration', 'min', 1, 240, 1],
                ['minFrequency', 'Minimum frequency', 'kHz', 10, 100, 1],
                ['maxFrequency', 'Maximum frequency', 'kHz', 10, 100, 1],
                ['maxEnergy', 'Maximum energy', 'kWh', 0.001, 10, 0.001],
                ['volume', 'Water volume', 'L', 1, 100000, 1],
                ['turbidity', 'Initial turbidity', 'NTU', 0, 1000, 0.1],
              ].map((field) => (
                <NumberField key={field[0]} field={field} value={optimization[field[0]]} onChange={(key, value) => setOptimization((current) => ({ ...current, [key]: value === '' ? '' : Number(value) }))} />
              ))}
              <label className="studio-field">
                <span>Optimization objective</span>
                <select value={objective} onChange={(event) => setObjective(event.target.value)}>
                  {OPTIMIZATION_OBJECTIVES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <button type="button" className="sim-btn" onClick={runOptimization}><Target size={14} /> Search valid configurations</button>
            </div>
            <div>
              {optimizationResult ? (
                optimizationResult.selected ? (
                  <>
                    <div className="studio-note studio-success">
                      Recommended from {optimizationResult.candidateCount} valid candidates. Select “Load into simulator” to compare it with other scenarios.
                    </div>
                    <TreatmentResults result={optimizationResult.selected.result} />
                    <div className="studio-parameter-summary">
                      {Object.entries(optimizationResult.selected.parameters).map(([key, value]) => <span key={key}><strong>{key}:</strong> {value}</span>)}
                    </div>
                    <button type="button" className="sim-btn" onClick={() => loadParameters(optimizationResult.selected.parameters)}>Load into simulator</button>
                  </>
                ) : (
                  <div className="studio-note studio-error">No candidate satisfies all constraints. Increase maximum power, duration, or energy, or lower the requested reduction.</div>
                )
              ) : <div className="studio-empty">Run the optimizer to search the configured parameter space.</div>}
            </div>
          </div>
          {optimizationHistory.length > 0 && (
            <div className="studio-table-wrap">
              <h3 className="studio-subtitle">Optimization history</h3>
              <table className="data-table">
                <thead><tr><th>Objective</th><th>Frequency</th><th>Power</th><th>Duration</th><th>Reduction</th><th>Energy</th><th>Score</th></tr></thead>
                <tbody>{optimizationHistory.map((entry) => <tr key={entry.id}><td>{entry.objective}</td><td>{entry.result.parameters.frequency} kHz</td><td>{entry.result.parameters.power} W</td><td>{entry.result.parameters.duration} min</td><td>{entry.result.result.predictedReduction}%</td><td>{entry.result.result.energyKwh} kWh</td><td>{entry.result.score}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
