// Filtration model shared by the dashboard and the 3D simulation so both use
// identical numbers. Values are illustrative simulation parameters.
export const FILTRATION = {
  flowMax: 1.0,            // fraction of pump capacity
  efficiencyMax: 0.88,     // clean-media removal efficiency
  efficiencyLoss: 0.55,    // efficiency lost at full media saturation
  mediaCapacity: 2600,     // captured mass before saturation
  captureRate: 42,         // captured mass / s at full flow and concentration
  algaeGrowth: 0.014,      // per second when the pump is off
  algaeRemoval: 0.052,     // per second at full flow
};
