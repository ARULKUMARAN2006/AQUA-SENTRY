// Configurable water-quality thresholds.
// Each parameter defines ordered bands from best (narrowest) to worst (catch-all).
// Classification picks the first band where value >= min && value <= max.
export const DEFAULT_THRESHOLDS = {
  ph: {
    label: 'pH',
    unit: '',
    minValid: 0,
    maxValid: 14,
    step: 0.1,
    bands: [
      { status: 'Good', min: 6.5, max: 8.5, color: 'green' },
      { status: 'Moderate', min: 6.0, max: 9.0, color: 'yellow' },
      { status: 'Poor', min: 5.0, max: 10.0, color: 'orange' },
      { status: 'Critical', min: -Infinity, max: Infinity, color: 'red' },
    ],
  },
  turbidity: {
    label: 'Turbidity',
    unit: 'NTU',
    minValid: 0,
    maxValid: 100,
    step: 0.5,
    bands: [
      { status: 'Good', min: 0, max: 20, color: 'green' },
      { status: 'Moderate', min: 20, max: 50, color: 'yellow' },
      { status: 'Poor', min: 50, max: 75, color: 'orange' },
      { status: 'Critical', min: 0, max: Infinity, color: 'red' },
    ],
  },
  temperature: {
    label: 'Temperature',
    unit: '°C',
    minValid: 0,
    maxValid: 100,
    step: 0.5,
    bands: [
      { status: 'Good', min: 0, max: 20, color: 'green' },
      { status: 'Moderate', min: 20, max: 50, color: 'yellow' },
      { status: 'Moderate', min: 50, max: 75, color: 'yellow' },
      { status: 'Critical', min: -Infinity, max: Infinity, color: 'red' },
    ],
  },
  tds: {
    label: 'TDS',
    unit: 'ppm',
    minValid: 0,
    maxValid: 2500,
    step: 10,
    bands: [
      { status: 'Good', min: 0, max: 300, color: 'green' },
      { status: 'Moderate', min: 0, max: 500, color: 'yellow' },
      { status: 'Poor', min: 0, max: 1000, color: 'orange' },
      { status: 'Critical', min: 0, max: Infinity, color: 'red' },
    ],
  },
  // Dissolved oxygen probe (mg/L). Low DO indicates organic load / algal decay.
  do: {
    label: 'Dissolved Oxygen',
    unit: 'mg/L',
    minValid: 0,
    maxValid: 20,
    step: 0.1,
    bands: [
      { status: 'Good', min: 5.0, max: 11.5, color: 'green' },
      { status: 'Moderate', min: 4.0, max: 13.0, color: 'yellow' },
      { status: 'Poor', min: 2.0, max: 15.0, color: 'orange' },
      { status: 'Critical', min: -Infinity, max: Infinity, color: 'red' },
    ],
  },
  // Optical underwater sensor: percentage of surface light still transmitted
  // at sensor depth. Falls as suspended algae and turbidity increase.
  optical: {
    label: 'Optical Underwater',
    unit: '% T',
    minValid: 0,
    maxValid: 100,
    step: 1,
    bands: [
      { status: 'Good', min: 70, max: 100, color: 'green' },
      { status: 'Moderate', min: 45, max: 100, color: 'yellow' },
      { status: 'Poor', min: 20, max: 45, color: 'orange' },
      { status: 'Critical', min: -Infinity, max: Infinity, color: 'red' },
    ],
  },
};

export const THRESHOLDS = DEFAULT_THRESHOLDS;

export const STATUS_SEVERITY = { Good: 0, Moderate: 1, Poor: 2, Critical: 3 };
export const STATUS_COLOR = { green: '#22c55e', yellow: '#eab308', orange: '#f97316', red: '#ef4444' };
export const STATUS_COLOR_BY_NAME = {
  Good: '#22c55e',
  Moderate: '#eab308',
  Poor: '#f97316',
  Critical: '#ef4444',
  Active: '#22c55e',
  Standby: '#eab308',
  Inactive: '#94a3b8',
  Fault: '#ef4444',
};
