import React from 'react';
import { STATUS_COLOR_BY_NAME } from '../data/thresholds';

export default function StatusDot({ status }) {
  return (
    <span
      className="status-dot"
      style={{ background: STATUS_COLOR_BY_NAME[status] || '#94a3b8' }}
    />
  );
}
