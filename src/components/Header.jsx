import React from 'react';
import { useClock } from '../hooks/useClock';
import { Menu, Activity, SlidersHorizontal } from 'lucide-react';

export default function Header({
  title,
  subtitle,
  connectionStatus,
  onMenuToggle,
  onOpenThresholds,
}) {
  const now = useClock();

  const formattedDate = now.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        {onMenuToggle && (
          <button
            className="mobile-menu-btn"
            onClick={onMenuToggle}
            aria-label="Toggle navigation menu"
          >
            <Menu size={22} />
          </button>
        )}
        <div className="topbar-titles">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>

      <div className="topbar-right">
        <div className="clock-badge">
          <span className="clock-date">{formattedDate}</span>
          <span className="clock-time">{formattedTime}</span>
        </div>

        <div className="topbar-controls">
          <div
            className={`conn-status ${
              connectionStatus === 'Simulated'
                ? 'sim'
                : connectionStatus === 'Stale' || connectionStatus === 'Unavailable'
                  ? 'stale'
                  : 'online'
            }`}
            title="System Connection Mode"
          >
            <Activity size={14} className="pulse-icon" />
            <span>
              {connectionStatus === 'Simulated'
                ? 'Edge Telemetry: Simulated'
                : `IoT: ${connectionStatus}`}
            </span>
          </div>

          {onOpenThresholds && (
            <button
              className="threshold-pill-btn"
              onClick={onOpenThresholds}
              title="Configure sensor thresholds"
            >
              <SlidersHorizontal size={14} />
              <span>Thresholds</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
