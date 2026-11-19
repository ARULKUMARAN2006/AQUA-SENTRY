import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Waves, User, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, Activity, Droplets, Radio, Gauge, Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { signIn, demoCredentials } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (busy) return;
      setError('');
      setBusy(true);
      // Small delay so the button's pending state is visible.
      window.setTimeout(() => {
        const result = signIn({ username, password, remember });
        setBusy(false);
        if (result.ok) navigate('/dashboard', { replace: true });
        else setError(result.error);
      }, 350);
    },
    [busy, signIn, username, password, remember, navigate],
  );

  const fillDemo = useCallback(() => {
    setUsername(demoCredentials.username);
    setPassword(demoCredentials.password);
    setError('');
  }, [demoCredentials]);

  return (
    <div className="login-shell">
      <button type="button" className="login-back" onClick={() => navigate('/')}>
        <ArrowLeft size={16} />
        <span>BACK</span>
      </button>

      <div className="login-stage">
        <section className="login-project-art" aria-label="AQUA SENTRY system overview">
          <div className="login-art-kicker"><span className="login-art-pulse" /> LIVE WATER SYSTEM</div>
          <h2>See the water.<br /><span>Understand the change.</span></h2>
          <p className="login-art-copy">
            AQUA SENTRY connects water-quality telemetry, filtration, and ultrasonic treatment
            in one operational view.
          </p>
          <div className="login-art-orbit">
            <div className="login-art-ring login-art-ring-one" />
            <div className="login-art-ring login-art-ring-two" />
            <div className="login-art-core"><Waves size={38} /></div>
            <span className="login-art-dot login-art-dot-one" />
            <span className="login-art-dot login-art-dot-two" />
            <span className="login-art-dot login-art-dot-three" />
            <div className="login-art-scan" />
          </div>
          <div className="login-art-console">
            <div className="login-console-head">
              <span>LIVE SYSTEM PULSE</span><b><i /> NOMINAL</b>
            </div>
            <div className="login-wave">
              <span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
            </div>
            <div className="login-console-foot"><span>WATER QUALITY</span><strong>94.8%</strong><em>+2.4%</em></div>
          </div>
          <div className="login-art-metrics">
            <div><Droplets size={16} /><strong>6</strong><span>water sensors</span></div>
            <div><Activity size={16} /><strong>3s</strong><span>telemetry cycle</span></div>
            <div><Radio size={16} /><strong>24/7</strong><span>system watch</span></div>
          </div>
          <div className="login-art-pipeline">
            <div><Gauge size={14} /><span>DETECT</span></div>
            <b />
            <div><Droplets size={14} /><span>NEUTRALIZE</span></div>
            <b />
            <div><Zap size={14} /><span>PROTECT</span></div>
          </div>
          
        </section>

        {/* ---- Login card ---- */}
        <div className="login-panel-wrap">
          <form className="login-panel" onSubmit={handleSubmit} noValidate>
            <div className="login-logo" aria-hidden="true">
              <Waves size={30} />
            </div>

            <h1 className="login-brand">AQUA SENTRY</h1>
            <p className="login-tagline">
              Adaptive Edge-Driven Intelligent Aquatic Revitalization System
            </p>

            <div className="login-rule" />

            <p className="login-sub">Secure Access to Water-Quality Operations Console</p>

            {error && <div className="login-error" role="alert">{error}</div>}

            <label className="login-field">
              <span className="login-label">Username</span>
              <span className="login-input-wrap">
                <User size={17} className="login-input-icon" />
                <input
                  type="text"
                  className="login-input"
                  placeholder="Username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </span>
            </label>

            <label className="login-field">
              <span className="login-label">Password</span>
              <span className="login-input-wrap">
                <Lock size={17} className="login-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            <div className="login-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="login-box" aria-hidden="true" />
                <span>Remember me</span>
              </label>
              <button type="button" className="login-link" onClick={fillDemo}>
                Use demo access
              </button>
            </div>

            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? 'VERIFYING…' : 'LOGIN'}
            </button>

            <p className="login-alt">
              No operator account? <button type="button" className="login-link" onClick={fillDemo}>Request access</button>
            </p>

            <div className="login-foot">
              <span className="login-foot-item">
                <span className="foot-dot" /> System security active
              </span>
              <span className="login-foot-sep" />
              <span className="login-foot-item">
                <span className="foot-dot" /> Network online
              </span>
            </div>
          </form>

          <p className="login-disclaimer">
            <CheckCircle2 size={13} />
            Demonstration sign-in only — credentials are checked in the browser and are never sent anywhere.
          </p>
        </div>
      </div>
    </div>
  );
}