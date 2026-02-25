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
    <div className="min-h-screen bg-page">
      <div className="container mx-auto px-4 py-16 max-w-4xl">

        {/* Header */}
        <div className="text-center mb-14">
          <div className="text-6xl mb-4">🏓🍺</div>
          <h1 className="text-5xl font-black text-ink mb-3 tracking-tight">pingpong.beer</h1>
          <p className="text-ink-muted text-lg">Weekly ping pong tournaments, tracked.</p>
        </div>

        {/* Primary action */}
        <div className="mb-8">
          {activeTournament ? (
            <Link href="/tournaments/active" className="group block bg-brand hover:bg-brand-hi rounded-xl p-7 transition-all duration-200 border border-brand-hi">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl mb-2">⚡</div>
                  <h2 className="text-2xl font-bold text-ink mb-1">Active Tournament</h2>
                  <p className="text-brand-text">Record games and manage the current tournament</p>
                </div>
                <div className="text-brand-text group-hover:text-ink text-3xl transition-colors">→</div>
              </div>
            </Link>
          ) : (
            <Link href="/tournaments/new" className="group block bg-brand hover:bg-brand-hi rounded-xl p-7 transition-all duration-200 border border-brand-hi">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl mb-2">➕</div>
                  <h2 className="text-2xl font-bold text-ink mb-1">New Tournament</h2>
                  <p className="text-brand-text">Set up round robin, bracket format, and best-of</p>
                </div>
                <div className="text-brand-text group-hover:text-ink text-3xl transition-colors">→</div>
              </div>
            </Link>
          )}
        </div>

        {/* Secondary nav */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Link href="/players" className="group bg-surface hover:bg-overlay rounded-xl p-6 border border-edge hover:border-edge-hi transition-all duration-200">
            <div className="text-3xl mb-3">👥</div>
            <h3 className="text-lg font-bold text-ink mb-1 group-hover:text-win transition-colors">Players & Stats</h3>
            <p className="text-ink-muted text-sm">Leaderboard, win rates, and player history</p>
          </Link>

          <Link href="/tournaments/history" className="group bg-surface hover:bg-overlay rounded-xl p-6 border border-edge hover:border-edge-hi transition-all duration-200">
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-lg font-bold text-ink mb-1 group-hover:text-win transition-colors">Tournament History</h3>
            <p className="text-ink-muted text-sm">Past tournaments, brackets, and results</p>
          </Link>
        </div>

      </div>
    </div>
  );
}


