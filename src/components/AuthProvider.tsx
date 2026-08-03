'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Role = 'player' | 'admin';
type AuthContextValue = { role: Role; isAdmin: boolean; refresh: () => Promise<void> };

const AuthContext = createContext<AuthContextValue>({ role: 'player', isAdmin: false, refresh: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('player');

  const refresh = async () => {
    const response = await fetch('/api/auth/session');
    if (response.ok) setRole((await response.json()).role === 'admin' ? 'admin' : 'player');
  };

  useEffect(() => { refresh(); }, []);

  return <AuthContext.Provider value={{ role, isAdmin: role === 'admin', refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthControls() {
  const { isAdmin, refresh } = useAuth();
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

  if (isAdmin) return <button onClick={logout} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Admin · Sign out</button>;
  return (
    <div className="relative">
      <button onClick={() => setOpen(value => !value)} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Player view · Admin sign in</button>
      {open && <form onSubmit={login} className="absolute right-0 top-7 z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
        <label className="block text-xs font-semibold text-gray-600 mb-1">Admin password</label>
        <input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-300" />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <button type="submit" className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">Sign in</button>
      </form>}
    </div>
  );
}
