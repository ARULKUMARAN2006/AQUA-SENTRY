import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * AuthContext — client-side session gate for the Aqua Sentry console.
 *
 * IMPORTANT: this is a *demo* gate, not real security.
 *  • No server is contacted. Credentials are never transmitted or stored.
 *  • The "account" below is a fixed local placeholder for the demonstration
 *    console.
 *  • Real deployment would replace `signIn` with a POST to an identity service.
 */

const STORAGE_KEY = 'aqua-sentry.session';

const DEMO_USER = { username: 'AQUA SENTRY', password: 'AIDS', role: 'Operator' };

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);

  const persist = useCallback((next) => {
    setSession(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable (private mode) — session simply won't persist */
    }
  }, []);

  /** @returns {{ok: true} | {ok: false, error: string}} */
  const signIn = useCallback(
    ({ username, password, remember }) => {
      const user = String(username || '').trim();
      const pass = String(password || '');

      if (!user) return { ok: false, error: 'Enter your username.' };
      if (user.toUpperCase() !== DEMO_USER.username || pass !== DEMO_USER.password) {
        return { ok: false, error: 'Invalid AQUA SENTRY credentials.' };
      }

      persist({
        username: user,
        role: DEMO_USER.role,
        // No token, no secret: this flag exists only to make the demo obvious.
        demoOnly: true,
        since: new Date().toISOString(),
      });

      if (!remember) {
        // Session-only: drop the value on tab close.
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      return { ok: true };
    },
    [persist],
  );

  const signOut = useCallback(() => persist(null), [persist]);

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: !!session,
      user: session?.username || null,
      role: session?.role || null,
      signIn,
      signOut,
      demoCredentials: DEMO_USER,
    }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export default AuthContext;