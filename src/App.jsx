import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SensorProvider } from './context/SensorContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar, { routeFor } from './components/Sidebar';
import ThresholdConfigModal from './components/ThresholdConfigModal';
import AquaSentrySimulation from './components/AquaSentrySimulation';
import Dashboard from './pages/Dashboard';
import WaterMonitoring from './pages/WaterMonitoring';
import WaterQualityAnalysis from './pages/WaterQualityAnalysis';
import Analytics from './pages/Analytics';
import RobotStatus from './pages/RobotStatus';
import FiltrationMonitoring from './pages/FiltrationMonitoring';
import Alerts from './pages/Alerts';
import HistoryPage from './pages/History';
import Login from './pages/Login';
import TreatmentStudioPage from './pages/TreatmentStudioPage';

export const MENU = [
  'Dashboard',
  'Water Monitoring',
  'Water Quality Analysis',
  'Analytics',
  'Robot Status',
  'Filtration Monitoring',
  'Alerts',
  'History',
  'Treatment Studio',
  '3D Simulation',
];

function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [thresholdModalOpen, setThresholdModalOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const openThresholds = () => setThresholdModalOpen(true);
  const menuToggle = () => setSidebarOpen((v) => !v);

  const activeMenuItem =
    MENU.find((m) => location.pathname.startsWith(routeFor(m))) || 'Dashboard';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        items={MENU}
        active={activeMenuItem}
        onNavigate={() => {}}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenThresholds={openThresholds}
      />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/water-monitoring" element={<WaterMonitoring onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/water-quality-analysis" element={<WaterQualityAnalysis onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/analytics" element={<Analytics onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/robot-status" element={<RobotStatus onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/filtration-monitoring" element={<FiltrationMonitoring onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/alerts" element={<Alerts onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/history" element={<HistoryPage onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/treatment-studio" element={<TreatmentStudioPage onMenuToggle={menuToggle} onOpenThresholds={openThresholds} />} />
          <Route path="/simulation" element={<SimulationView />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      <ThresholdConfigModal isOpen={thresholdModalOpen} onClose={() => setThresholdModalOpen(false)} />
    </div>
  );
}

/** The 3D twin runs full-screen, outside the dashboard shell. */
function SimulationView() {
  return (
    <div className="sim-shell">
      <AquaSentrySimulation />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SensorProvider>
        <BrowserRouter>
          <Routes>
            {/* Login is outside the dashboard shell. */}
            <Route path="/login" element={<LoginGate />} />
            <Route path="*" element={<Shell />} />
          </Routes>
        </BrowserRouter>
      </SensorProvider>
    </AuthProvider>
  );
}

/** Shows the login card, or bounces straight to the console if already signed in. */
function LoginGate() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Login />;
}
