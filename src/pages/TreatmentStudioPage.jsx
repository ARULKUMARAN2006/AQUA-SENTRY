import React from 'react';
import Header from '../components/Header';
import TreatmentStudio from '../components/TreatmentStudio';
import { useSensors } from '../context/SensorContext';

export default function TreatmentStudioPage({ onMenuToggle, onOpenThresholds }) {
  const { connectionStatus } = useSensors();

  return (
    <div className="page">
      <Header
        title="Treatment Stimulation Studio"
        subtitle="What-if simulation, algorithmic strategy comparison, and constrained optimization"
        connectionStatus={connectionStatus}
        onMenuToggle={onMenuToggle}
        onOpenThresholds={onOpenThresholds}
      />
      <TreatmentStudio />
    </div>
  );
}
