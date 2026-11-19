// Shared, configurable tuning for the AQUA SENTRY digital-twin simulation.
// Units are metres / seconds unless stated otherwise.

export const LAKE = {
  radius: 92,          // nominal shoreline radius
  bedDepth: 7.5,       // lake-bed depth at the centre
  shoreWidth: 26,      // horizontal distance over which the bank rises
  hillHeight: 9.0,
  waterSize: 520,
  waterSegments: 220,
  terrainSize: 620,
  terrainSegments: 200,
  // Robot is kept this far inside the shoreline
  robotMargin: 9,
};

// Wave spectrum. The exact same list drives the GLSL water shader and the
// CPU buoyancy sampler so the hull always sits on the visible surface.
export const WAVES = [
  { dir: [1.0, 0.18], amp: 0.085, len: 15.0, speed: 1.05 },
  { dir: [-0.42, 1.0], amp: 0.055, len: 8.6, speed: 1.25 },
  { dir: [0.78, -0.66], amp: 0.030, len: 4.7, speed: 1.55 },
  { dir: [0.22, 1.0], amp: 0.016, len: 2.6, speed: 1.9 },
];

export const ROBOT = {
  width: 2.90,        // X
  depth: 1.78,        // Z
  deckY: 0.295,       // top of the deck plate above the waterline
  // thruster ducts (local space)
  thrusters: [
    { id: 'FL', x: -1.00, y: -0.16, z: 0.62 },
    { id: 'FR', x: 1.00, y: -0.16, z: 0.62 },
    { id: 'RL', x: -1.00, y: -0.16, z: -0.62 },
    { id: 'RR', x: 1.00, y: -0.16, z: -0.62 },
  ],
};

export const MOVEMENT = {
  maxSpeed: 2.7,
  reverseFactor: 0.55,
  accel: 2.4,
  brakeDecel: 4.2,
  coastDecel: 1.1,
  turnRate: 1.25,        // rad/s at full speed
  turnAccel: 3.0,
  // differential thrust gain for turning
  steerThrust: 0.85,
  pitchPerAccel: 0.055,
  rollPerSteer: 0.16,
  yawDamping: 3.4,
};

export const PROPELLER = {
  idleRPM: 1.2,          // rad/s when idling in water
  maxRPM: 46,            // rad/s at full thrust
  spinUp: 2.6,           // how fast RPM follows demand
  spinDown: 1.8,
};

export const FILTRATION = {
  pumpOn: true,
  flowRiseTime: 1.6,      // s to reach full flow
  efficiencyMax: 0.88,    // clean-media removal efficiency
  efficiencyLoss: 0.55,   // efficiency lost at full saturation
  mediaCapacity: 2600,    // captured particle mass before saturation
  captureRate: 42,        // captured mass / s at full flow and concentration
  lakeAlgaeStart: 0.55,
  algaeGrowth: 0.014,     // per second when the pump is off
  algaeRemoval: 0.18,     // per second at full flow; visual demo clears in a few seconds
  ultrasonicRemoval: 0.11, // per second at full treatment progress
  algaeMin: 0.05,
  algaeMax: 1.0,
};

export const CAMERA_MODES = [
  { id: 1, key: '1', label: 'Follow', hint: 'Behind and above the prototype' },
  { id: 2, key: '2', label: 'Free orbit', hint: 'Drag to orbit · wheel to zoom · right-drag to pan' },
  { id: 3, key: '3', label: 'Top machine', hint: 'Direct top view of the machine deck' },
  { id: 4, key: '4', label: 'Underwater', hint: 'Below the surface: thrusters, intake, discharge' },
  { id: 5, key: '5', label: 'Filter close-up', hint: 'Inspect the filter chambers and capture' },
];

export const COLORS = {
  algae: new Float32Array([0.24, 0.62, 0.18]),
  algaeHot: new Float32Array([0.45, 0.82, 0.22]),
  cleanWater: new Float32Array([0.62, 0.88, 0.95]),
};
