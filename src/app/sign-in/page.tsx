'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../components/AuthProvider';

type State = { kind: 'loading' } | { kind: 'ready'; token: string } | { kind: 'working'; token: string } | { kind: 'error'; message: string };

/**
 * Where an emailed sign-in link lands. Signing in takes a click rather than
 * happening on load, so email scanners that open links don't use them up.
 */
export default function SignInPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Drop the token from the address bar and history.
    window.history.replaceState(null, '', window.location.pathname);
    setState(token ? { kind: 'ready', token } : { kind: 'error', message: 'This sign-in link is incomplete. Request a new one from Settings.' });
  }, []);

  const signIn = async (token: string) => {
    setState({ kind: 'working', token });
    try {
      const response = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setState({ kind: 'error', message: err.error ?? 'Could not sign you in. Request a new link.' });
        return;
      }
      await refresh();
      router.replace('/');
    } catch {
      setState({ kind: 'ready', token });
    }
  };

  return (
    <main className="app-shell">
      <div className="page-container page-container--narrow space-y-6">
        <PageHeader title="Sign in" description="Finish signing in as a club admin." />
        <section className="surface-card p-6">
          {(state.kind === 'ready' || state.kind === 'working') && (
            <button type="button" onClick={() => signIn(state.token)} disabled={state.kind === 'working'} className="button button-primary">
              {state.kind === 'working' ? 'Signing in…' : 'Sign in'}
            </button>
          )}
          {state.kind === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-loss" role="alert">{state.message}</p>
              <Link href="/settings" className="button button-secondary">Go to Settings</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
