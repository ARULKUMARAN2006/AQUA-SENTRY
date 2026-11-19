import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Droplets,
  FlaskConical,
  BarChart3,
  Bot,
  Filter,
  Bell,
  History as HistoryIcon,
  Box,
  Waves,
  X,
  Sliders,
  LogOut,
} from 'lucide-react';
import { useSensors } from '../context/SensorContext';
import { useAuth } from '../context/AuthContext';
import { buildAlerts } from '../utils/alerts';

const ICONS = {
  Dashboard: LayoutDashboard,
  'Water Monitoring': Droplets,
  'Water Quality Analysis': FlaskConical,
  Analytics: BarChart3,
  'Robot Status': Bot,
  'Filtration Monitoring': Filter,
  Alerts: Bell,
  History: HistoryIcon,
  '3D Simulation': Box,
  'Treatment Studio': FlaskConical,
};

export default function Sidebar({
  items,
  active,
  onNavigate,
  isOpen,
  onClose,
  onOpenThresholds,
}) {
  const { history, initialized, thresholds, clearedAlerts } = useSensors();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(isOpen);

  // Active page derived from the URL so browser back/forward stays in sync.
  const activeItem = items.find((item) => location.pathname.startsWith(routeFor(item))) ??
    items.find((i) => i === active) ?? items[0];

  const alertCount = React.useMemo(() => {
    if (!initialized) return 0;
    const all = buildAlerts(history, thresholds);
    return all.filter((a) => !clearedAlerts.has(a.id)).length;
  }, [history, initialized, thresholds, clearedAlerts]);

  const handleItemClick = (item) => {
    navigate(routeFor(item));
    if (onNavigate) onNavigate(item);
    setOpen(false);
    if (onClose) onClose();
  };

  const close = useCallback(() => {
    setOpen(false);
    if (onClose) onClose();
  }, [onClose]);

  const handleLogout = useCallback(() => {
    signOut();
    close();
    navigate('/login', { replace: true });
  }, [signOut, close, navigate]);

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={close} aria-hidden="true" />}
      <aside className={`sidebar ${open || isOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Waves size={22} color="#ffffff" />
          </div>
          <div className="brand-text">
            <span className="brand-title">AQUA SENTRY</span>
            <span className="brand-sub">Aquatic Revitalization</span>
          </div>
          <button className="sidebar-close-btn" onClick={close} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => {
            const Icon = ICONS[item] || LayoutDashboard;
            const isActive = activeItem === item;
            return (
              <button
                key={item}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleItemClick(item)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={19} className="nav-icon" />
                <span className="nav-text">{item}</span>
                {item === 'Alerts' && alertCount > 0 && (
                  <span className="nav-counter">{alertCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-config-section">
          <button
            type="button"
            className="sidebar-config-btn"
            onClick={() => {
              if (onOpenThresholds) onOpenThresholds();
              close();
            }}
          >
            <Sliders size={16} />
            <span>Config Thresholds</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="sim-badge-container">
            <span className="sim-badge">Simulated Demo Data</span>
            <span className="footer-disclaimer">No physical hardware attached</span>
          </div>

          {session && (
            <div className="sidebar-session">
              <div className="session-user">
                <span className="session-name">{session.username}</span>
                <span className="session-role">{session.role}</span>
              </div>
              <button className="session-logout" onClick={handleLogout} title="Sign out">
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/** Menu label -> route path. Single source of truth, so there are no duplicates. */
export function routeFor(label) {
  switch (label) {
    case 'Dashboard': return '/dashboard';
    case 'Water Monitoring': return '/water-monitoring';
    case 'Water Quality Analysis': return '/water-quality-analysis';
    case 'Analytics': return '/analytics';
    case 'Robot Status': return '/robot-status';
    case 'Filtration Monitoring': return '/filtration-monitoring';
    case 'Alerts': return '/alerts';
    case 'History': return '/history';
    case 'Treatment Studio': return '/treatment-studio';
    case '3D Simulation': return '/simulation';
    default: return '/dashboard';
  }
}

export { ICONS as NAV_ICONS };
