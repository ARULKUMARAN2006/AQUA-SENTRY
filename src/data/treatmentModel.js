// Preliminary, configurable treatment-response model for software exploration.
// It is not experimentally calibrated and must not be interpreted as measured
// algae removal or a guarantee of field performance.

export const DEFAULT_TREATMENT_PARAMETERS = {
  initialAlgae: 100,
  frequency: 28,
  power: 60,
  duration: 20,
  dutyCycle: 70,
  volume: 1000,
  turbidity: 8,
  targetReduction: 80,
};

export const MODEL_CONFIG = {
  referenceFrequency: 28,
  frequencyBandwidth: 10,
  referencePower: 60,
  referenceVolume: 1000,
  referenceTurbidity: 8,
  referenceRatePerMinute: 0.06,
  referenceTariff: 0.15,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normaliseTreatmentParameters(input = {}) {
  const p = { ...DEFAULT_TREATMENT_PARAMETERS, ...input };
  return {
    initialAlgae: Math.max(0, finite(p.initialAlgae, DEFAULT_TREATMENT_PARAMETERS.initialAlgae)),
    frequency: clamp(finite(p.frequency, DEFAULT_TREATMENT_PARAMETERS.frequency), 10, 100),
    power: clamp(finite(p.power, DEFAULT_TREATMENT_PARAMETERS.power), 0, 500),
    duration: clamp(finite(p.duration, DEFAULT_TREATMENT_PARAMETERS.duration), 1, 240),
    dutyCycle: clamp(finite(p.dutyCycle, DEFAULT_TREATMENT_PARAMETERS.dutyCycle), 1, 100),
    volume: Math.max(1, finite(p.volume, DEFAULT_TREATMENT_PARAMETERS.volume)),
    turbidity: Math.max(0, finite(p.turbidity, DEFAULT_TREATMENT_PARAMETERS.turbidity)),
    targetReduction: clamp(finite(p.targetReduction, DEFAULT_TREATMENT_PARAMETERS.targetReduction), 0, 99.9),
  };
}

function responseFactors(parameters) {
  const frequencyDistance = (parameters.frequency - MODEL_CONFIG.referenceFrequency)
    / MODEL_CONFIG.frequencyBandwidth;
  const frequencyFactor = Math.exp(-0.5 * frequencyDistance ** 2);
  const powerFactor = parameters.power / (parameters.power + MODEL_CONFIG.referencePower);
  const dutyFactor = parameters.dutyCycle / 100;
  const volumeFactor = Math.sqrt(MODEL_CONFIG.referenceVolume / parameters.volume);
  const turbidityFactor = 1 / (1 + Math.max(0, parameters.turbidity - MODEL_CONFIG.referenceTurbidity) / 40);

  return {
    frequencyFactor,
    powerFactor,
    dutyFactor,
    volumeFactor,
    turbidityFactor,
  };
}

export function simulateTreatment(input = {}, points = 25) {
  const parameters = normaliseTreatmentParameters(input);
  const factors = responseFactors(parameters);
  const rate = MODEL_CONFIG.referenceRatePerMinute
    * factors.frequencyFactor
    * factors.powerFactor
    * factors.dutyFactor
    * factors.volumeFactor
    * factors.turbidityFactor;
  const samples = Math.max(2, Math.floor(points));
  const series = Array.from({ length: samples }, (_, index) => {
    const minutes = parameters.duration * index / (samples - 1);
    const remaining = parameters.initialAlgae * Math.exp(-rate * minutes);
    return {
      minutes: +minutes.toFixed(2),
      algae: +remaining.toFixed(3),
      reduction: parameters.initialAlgae > 0
        ? +((1 - remaining / parameters.initialAlgae) * 100).toFixed(2)
        : 0,
    };
  });
  const finalPoint = series[series.length - 1];
  const energyKwh = (parameters.power * (parameters.dutyCycle / 100) * parameters.duration) / 60 / 1000;

  return {
    parameters,
    factors,
    rate,
    series,
    predictedReduction: finalPoint.reduction,
    remainingAlgae: finalPoint.algae,
    energyKwh: +energyKwh.toFixed(4),
    estimatedCost: +(energyKwh * MODEL_CONFIG.referenceTariff).toFixed(4),
    assumptions: [
      'First-order decay is used as a transparent preliminary response model.',
      'Frequency response is a Gaussian centered on the configurable reference frequency.',
      'Power, duty cycle, water volume, and turbidity scale the response rate.',
      'No experimental calibration data is available in this project.',
    ],
  };
}

export function createStrategies(baseInput = {}) {
  const base = normaliseTreatmentParameters(baseInput);
  const candidates = [
    {
      id: 'low-energy',
      name: 'Strategy A — Low Energy',
      objective: 'Minimise estimated energy while retaining a useful treatment response.',
      parameters: { ...base, frequency: 28, power: Math.min(base.power, 45), duration: Math.min(base.duration, 30), dutyCycle: 45 },
    },
    {
      id: 'fast',
      name: 'Strategy B — Fast Treatment',
      objective: 'Reach the response quickly using a shorter exposure window.',
      parameters: { ...base, frequency: 28, power: Math.max(base.power, 90), duration: Math.max(5, Math.min(base.duration, 10)), dutyCycle: 100 },
    },
    {
      id: 'maximum-reduction',
      name: 'Strategy C — Maximum Predicted Reduction',
      objective: 'Maximise the modelled reduction within the selected power and duration limits.',
      parameters: { ...base, frequency: 28, power: Math.max(base.power, 120), duration: Math.max(base.duration, 45), dutyCycle: 85 },
    },
  ];

  return candidates.map((strategy) => ({
    ...strategy,
    result: simulateTreatment(strategy.parameters),
  }));
}

export const OPTIMIZATION_OBJECTIVES = [
  { value: 'energy', label: 'Minimum energy consumption' },
  { value: 'time', label: 'Minimum treatment time' },
  { value: 'reduction', label: 'Maximum predicted reduction' },
  { value: 'balanced', label: 'Balanced reduction, time, and energy' },
];

export function optimiseTreatment(input = {}, objective = 'balanced') {
  const constraints = {
    initialAlgae: Math.max(0, finite(input.initialAlgae, DEFAULT_TREATMENT_PARAMETERS.initialAlgae)),
    targetReduction: clamp(finite(input.targetReduction, 70), 0, 99.9),
    maxPower: Math.max(1, finite(input.maxPower, 120)),
    maxDuration: Math.max(1, finite(input.maxDuration, 60)),
    minFrequency: clamp(finite(input.minFrequency, 20), 10, 100),
    maxFrequency: clamp(finite(input.maxFrequency, 40), 10, 100),
    maxEnergy: Math.max(0.001, finite(input.maxEnergy, 0.1)),
    volume: Math.max(1, finite(input.volume, DEFAULT_TREATMENT_PARAMETERS.volume)),
    turbidity: Math.max(0, finite(input.turbidity, DEFAULT_TREATMENT_PARAMETERS.turbidity)),
  };
  const minFrequency = Math.min(constraints.minFrequency, constraints.maxFrequency);
  const maxFrequency = Math.max(constraints.minFrequency, constraints.maxFrequency);
  const candidates = [];

  for (let frequency = minFrequency; frequency <= maxFrequency; frequency += 2) {
    for (let power = 10; power <= constraints.maxPower; power += 10) {
      for (let duration = 5; duration <= constraints.maxDuration; duration += 5) {
        for (const dutyCycle of [40, 60, 80, 100]) {
          const parameters = {
            initialAlgae: constraints.initialAlgae,
            frequency,
            power,
            duration,
            dutyCycle,
            volume: constraints.volume,
            turbidity: constraints.turbidity,
            targetReduction: constraints.targetReduction,
          };
          const result = simulateTreatment(parameters);
          if (result.energyKwh <= constraints.maxEnergy && result.predictedReduction >= constraints.targetReduction) {
            candidates.push({ parameters, result });
          }
        }
      }
    }
  }

  const maxReduction = Math.max(...candidates.map((c) => c.result.predictedReduction), constraints.targetReduction);
  const maxEnergy = Math.max(...candidates.map((c) => c.result.energyKwh), constraints.maxEnergy);
  const maxDuration = Math.max(...candidates.map((c) => c.parameters.duration), constraints.maxDuration);
  const score = (candidate) => {
    const reductionScore = candidate.result.predictedReduction / Math.max(1, maxReduction);
    const energyScore = 1 - candidate.result.energyKwh / maxEnergy;
    const timeScore = 1 - candidate.parameters.duration / maxDuration;
    if (objective === 'energy') return energyScore;
    if (objective === 'time') return timeScore;
    if (objective === 'reduction') return reductionScore;
    return reductionScore * 0.5 + energyScore * 0.25 + timeScore * 0.25;
  };

  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: score(candidate) }))
    .sort((a, b) => b.score - a.score);
  const selected = ranked[0] || null;

  return {
    constraints,
    objective,
    candidateCount: candidates.length,
    selected: selected ? { ...selected, score: +selected.score.toFixed(4) } : null,
    ranked: ranked.slice(0, 10).map((candidate) => ({ ...candidate, score: +candidate.score.toFixed(4) })),
  };
}
