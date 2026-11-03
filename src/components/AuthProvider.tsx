'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { AdminRole } from '../types/pingpong';

type Role = 'player' | 'admin';
export type SessionAdmin = { id: string; name: string; email: string; role: AdminRole; clubId: string };
type AuthContextValue = {
  role: Role;
  admin: SessionAdmin | null;
  isAdmin: boolean;
  isOwner: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  role: 'player', admin: null, isAdmin: false, isOwner: false, isLoading: true, refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<SessionAdmin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshId = useRef(0);

  const refresh = async () => {
    const currentRefreshId = ++refreshId.current;
    let nextAdmin: SessionAdmin | null = null;

    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      if (response.ok) nextAdmin = (await response.json()).admin ?? null;
    } catch {
      // Treat an unavailable session endpoint as a signed-out state.
    }

    // An older request must not overwrite a newer login/logout refresh.
    if (currentRefreshId === refreshId.current) {
      setAdmin(nextAdmin);
      setIsLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const value: AuthContextValue = {
    role: admin ? 'admin' : 'player',
    admin,
    isAdmin: Boolean(admin),
    isOwner: admin?.role === 'owner',
    isLoading,
    refresh,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

type LinkState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string };

export function AuthControls() {
  const { admin, isLoading, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<LinkState>({ kind: 'idle' });

  const requestLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ kind: 'sending' });
    try {
      const response = await fetch('/api/auth/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setState({ kind: 'error', message: err.error ?? 'Could not send the sign-in link. Try again.' });
        return;
      }
      setState({ kind: 'sent', email: email.trim() });
    } catch {
      setState({ kind: 'error', message: 'Could not send the sign-in link. Check your connection and try again.' });
    }
  };

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); await refresh(); };

  if (isLoading) {
    return <span className="settings-menu__status settings-menu__status--loading">Checking access...</span>;
  }

  if (admin) {
    return (
      <div className="settings-menu__account">
        <span className="settings-menu__status">
          Signed in as {admin.name || admin.email}{admin.role === 'owner' ? ' (owner)' : ''}
        </span>
        <button onClick={logout} className="settings-menu__action settings-menu__action--danger">Sign out</button>
      </div>
    );
  }

  if (state.kind === 'sent') {
    return (
      <div className="text-sm text-ink-soft" role="status">
        <p>
          If <span className="font-semibold text-ink">{state.email}</span> belongs to an admin, a sign-in link is on its way.
          It works once, for 15 minutes.
        </p>
        <button onClick={() => setState({ kind: 'idle' })} className="settings-menu__action mt-2">Use a different email</button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(value => !value)} className="settings-menu__action">
        Sign in as admin
      </button>
      {open && <form onSubmit={requestLink} className="settings-menu__login-form">
        <label htmlFor="admin-email" className="auth-controls__label">Admin email</label>
        <input
          id="admin-email" autoFocus type="email" autoComplete="email" required
          value={email} onChange={event => setEmail(event.target.value)}
          className="form-control w-full rounded-lg px-2 py-1.5 text-sm"
        />
        {state.kind === 'error' && <p className="mt-1 text-xs text-loss" role="alert">{state.message}</p>}
        <button type="submit" disabled={state.kind === 'sending'} className="button button-primary mt-2 w-full">
          {state.kind === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>}
    </>
  );
}
