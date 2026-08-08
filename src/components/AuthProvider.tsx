'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

type Role = 'player' | 'admin';
type AuthContextValue = { role: Role; isAdmin: boolean; isLoading: boolean; refresh: () => Promise<void> };

const AuthContext = createContext<AuthContextValue>({ role: 'player', isAdmin: false, isLoading: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('player');
  const [isLoading, setIsLoading] = useState(true);
  const refreshId = useRef(0);

  const refresh = async () => {
    const currentRefreshId = ++refreshId.current;
    let nextRole: Role = 'player';

    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      if (response.ok) nextRole = (await response.json()).role === 'admin' ? 'admin' : 'player';
    } catch {
      // Treat an unavailable session endpoint as a signed-out state.
    }

    // An older request must not overwrite a newer login/logout refresh.
    if (currentRefreshId === refreshId.current) {
      setRole(nextRole);
      setIsLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return <AuthContext.Provider value={{ role, isAdmin: role === 'admin', isLoading, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthControls({ embedded = false }: { embedded?: boolean } = {}) {
  const { isAdmin, isLoading, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!response.ok) { setError('Invalid admin password'); return; }
    setPassword(''); setError(''); setOpen(false); await refresh();
  };

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); await refresh(); };

  if (isLoading) {
    return <span className={embedded ? 'settings-menu__status settings-menu__status--loading' : 'auth-controls__button'}>Checking access...</span>;
  }

  if (isAdmin) {
    if (!embedded) return <button onClick={logout} className="auth-controls__button">Admin · Sign out</button>;
    return (
      <div className="settings-menu__account">
        <span className="settings-menu__status">Admin signed in</span>
        <button onClick={logout} className="settings-menu__action settings-menu__action--danger">Sign out</button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(value => !value)} className={embedded ? 'settings-menu__action' : 'auth-controls__button'}>
        {embedded ? 'Sign in as admin' : 'Player view · Admin sign in'}
      </button>
      {!embedded && open && <form onSubmit={login} className="auth-controls__popover">
          <label className="auth-controls__label">Admin password</label>
          <input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} className="form-control w-full rounded-lg px-2 py-1.5 text-sm" />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <button type="submit" className="button button-primary mt-2 w-full rounded-lg px-3 py-1.5 text-sm">Sign in</button>
        </form>}
      {embedded && open && <form onSubmit={login} className="settings-menu__login-form">
        <label className="auth-controls__label">Admin password</label>
        <input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} className="form-control w-full rounded-lg px-2 py-1.5 text-sm" />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <button type="submit" className="button button-primary mt-2 w-full rounded-lg px-3 py-1.5 text-sm">Sign in</button>
      </form>}
    </>
  );
}
