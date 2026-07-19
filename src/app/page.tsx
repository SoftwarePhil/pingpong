'use client';

import { useEffect, useState } from 'react';
import Link from "next/link";
import { Tournament } from "../types/pingpong";

export default function Home() {
  const [activeTournament, setActiveTournament] = useState<Tournament | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then((data: Tournament[]) => {
        setActiveTournament(data.find(t => t.status !== 'completed') ?? null);
      })
      .catch(() => setActiveTournament(null));
  }, []);

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: '52rem' }}>

        {/* Masthead */}
        <header className="mb-16 pt-8 animate-fade-up">
          <div className="flex items-center justify-between mb-10">
            <p className="eyebrow">office league · weekly</p>
            <span className="font-mono text-xs text-dim tracking-widest">v0.1</span>
          </div>

          <h1 className="display-xl mb-4">
            pingpong
            <span className="text-gold">.beer</span>
          </h1>

          <div className="flex items-end gap-6 mt-6">
            <p className="text-muted text-lg max-w-md leading-relaxed font-light">
              Round robin. Bracket. Scoreboard.
              <br />
              <span className="text-dim">No dashboards. Just games.</span>
            </p>
            <div className="hidden sm:block flex-1 rule-gold mb-3" />
          </div>
        </header>

        {/* Primary CTA */}
        <div className="mb-4 animate-fade-up animate-fade-up-delay-1">
          {activeTournament === undefined ? (
            <div className="hero-cta" style={{ minHeight: '9rem', opacity: 0.4 }}>
              <p className="eyebrow mb-3">loading</p>
              <div className="h-8 w-48 bg-surface-2 rounded" />
            </div>
          ) : activeTournament ? (
            <Link href="/tournaments/active" className="hero-cta live-pulse">
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="badge badge-lime">● live</span>
                    <span className="eyebrow" style={{ color: 'var(--text-dim)' }}>
                      {activeTournament.players.length} players
                    </span>
                  </div>
                  <h2 className="display-md mb-2">{activeTournament.name}</h2>
                  <p className="text-muted text-sm">
                    Record scores · manage bracket · keep the night going
                  </p>
                </div>
                <span className="arrow" aria-hidden>→</span>
              </div>
            </Link>
          ) : (
            <Link href="/tournaments/new" className="hero-cta">
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow mb-3">start something</p>
                  <h2 className="display-md mb-2">New Tournament</h2>
                  <p className="text-muted text-sm">
                    Round robin setup · best-of · bracket format
                  </p>
                </div>
                <span className="arrow" aria-hidden>→</span>
              </div>
            </Link>
          )}
        </div>

        {/* Secondary nav */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-20 animate-fade-up animate-fade-up-delay-2">
          <Link href="/players" className="nav-card">
            <div className="num">01</div>
            <h3 className="display-sm mb-1">Players</h3>
            <p className="text-muted text-sm leading-relaxed">
              Leaderboard, win rates, head-to-head records
            </p>
          </Link>

          <Link href="/tournaments/history" className="nav-card">
            <div className="num">02</div>
            <h3 className="display-sm mb-1">History</h3>
            <p className="text-muted text-sm leading-relaxed">
              Past tournaments, champions, full brackets
            </p>
          </Link>
        </div>

        {/* Footer mark */}
        <footer className="animate-fade-up animate-fade-up-delay-3">
          <div className="rule mb-6" />
          <div className="flex items-center justify-between text-dim text-xs font-mono tracking-wider">
            <span>TABLE · TAP · TOURNAMENT</span>
            <span>11 PTS · WIN BY 2</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
