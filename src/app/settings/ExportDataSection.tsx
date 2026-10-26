'use client';

import { useState } from 'react';
import { useAuth } from '../../components/AuthProvider';

type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; filename: string; summary: string }
  | { kind: 'error'; message: string };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Admin-only: downloads every player, tournament and game as one JSON file. */
export function ExportDataSection() {
  const { isAdmin } = useAuth();
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  if (!isAdmin) return null;

  const exportData = async () => {
    setState({ kind: 'working' });
    try {
      const res = await fetch('/api/export', { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setState({ kind: 'error', message: err.error ?? 'The export failed. Try again.' });
        return;
      }
      const text = await res.text();
      const { counts } = JSON.parse(text) as { counts: { players: number; tournaments: number; games: number } };
      const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'pingpong-export.json';

      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      setState({
        kind: 'done',
        filename,
        summary: `${plural(counts.players, 'player')}, ${plural(counts.tournaments, 'tournament')} and ${plural(counts.games, 'game')}`,
      });
    } catch {
      setState({ kind: 'error', message: 'The export failed. Check your connection and try again.' });
    }
  };

  return (
    <section className="surface-card p-6">
      <p className="label-caps text-muted">Data</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-prose text-sm text-ink-soft">
          Download every player, tournament and game as one JSON file. Keep it as a backup or to move the data elsewhere.
        </p>
        <button
          type="button"
          onClick={exportData}
          disabled={state.kind === 'working'}
          className="button button-secondary"
        >
          {state.kind === 'working' ? 'Preparing export…' : 'Export all data'}
        </button>
      </div>
      {state.kind === 'done' && (
        <p className="mt-3 text-sm text-win" role="status">
          Downloaded <span className="font-semibold">{state.filename}</span> with {state.summary}.
        </p>
      )}
      {state.kind === 'error' && (
        <p className="mt-3 text-sm text-loss" role="alert">{state.message}</p>
      )}
    </section>
  );
}
