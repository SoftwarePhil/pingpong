'use client';

import { useEffect, useRef, useState } from 'react';
import { Tournament } from '../../../types/pingpong';

export interface TournamentMenuAction {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Explains why the action is disabled. */
  hint?: string;
}

interface TournamentHeaderProps {
  tournament: Tournament;
  stage: string;
  stats: { label: string; value: string | number }[];
  /** Admin actions for the ⋯ menu; omit for viewers. */
  menuActions?: TournamentMenuAction[];
}

/** Scoreboard strip at the top of a live tournament: name, stage and headline numbers. */
export function TournamentHeader({ tournament, stage, stats, menuActions }: TournamentHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  return (
    <header className="scoreboard">
      <div className="flex items-start justify-between gap-6 px-6 pt-6 sm:px-8">
        <div className="min-w-0">
          <p className="label-caps flex items-center gap-2 text-ball">
            <span className="h-2 w-2 rounded-full bg-ball animate-pulse" aria-hidden="true" />
            {stage}
          </p>
          <h1 className="font-display mt-2 truncate text-3xl sm:text-4xl">{tournament.name}</h1>
          <p className="mt-1.5 text-sm text-board-muted">
            {tournament.players.length} players · started {new Date(tournament.startDate).toLocaleDateString()}
          </p>
        </div>
        {menuActions && menuActions.length > 0 && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Tournament actions"
              className="rounded-lg px-3 py-1.5 text-lg leading-none text-board-muted transition-colors hover:bg-white/10 hover:text-board-ink"
            >
              ⋯
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-xl">
                {menuActions.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    role="menuitem"
                    disabled={action.disabled}
                    title={action.hint}
                    onClick={() => { setMenuOpen(false); action.onSelect(); }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      action.tone === 'danger' ? 'text-loss hover:bg-loss-soft' : 'hover:bg-surface-sunken hover:text-table'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <dl className="mt-6 grid grid-cols-3 border-t border-white/10">
        {stats.map((stat, index) => (
          <div key={stat.label} className={`px-6 py-4 sm:px-8 ${index > 0 ? 'border-l border-white/10' : ''}`}>
            <dt className="label-caps text-board-muted">{stat.label}</dt>
            <dd className="font-digits mt-1 text-3xl">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
