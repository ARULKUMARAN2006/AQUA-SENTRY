import React from 'react';
import StatusBadge from './StatusBadge';
import StatusDot from './StatusDot';

export default function StatCard({ title, value, unit, status, note }) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <span className="stat-title">{title}</span>
        <StatusDot status={status} />
      </div>
      <div className="stat-value">
        {value}<span className="stat-unit">{unit}</span>
      </div>
      <div className="stat-footer">
        <StatusBadge status={status} />
        {note && <span className="stat-note">{note}</span>}
      </div>
    </div>
  );
}
