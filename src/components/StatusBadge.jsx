import React from 'react';

export default function StatusBadge({ status }) {
  const color =
    status === 'Good' ? 'green' :
    status === 'Moderate' ? 'yellow' :
    status === 'Poor' ? 'orange' :
    status === 'Critical' ? 'red' :
    status === 'Active' ? 'green' :
    status === 'Inactive' ? 'gray' :
    status === 'Standby' ? 'yellow' :
    status === 'Fault' ? 'red' : 'gray';
  return <span className={`status-badge ${color}`}>{status}</span>;
}
