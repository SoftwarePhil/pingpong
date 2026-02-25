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
    <div className="min-h-screen bg-zinc-950">
      <div className="container mx-auto px-4 py-16 max-w-4xl">

        {/* Header */}
        <div className="text-center mb-14">
          <div className="text-6xl mb-4">🏓🍺</div>
          <h1 className="text-5xl font-black text-white mb-3 tracking-tight">pingpong.beer</h1>
          <p className="text-zinc-400 text-lg">Weekly ping pong tournaments, tracked.</p>
        </div>

        {/* Primary action */}
        <div className="mb-8">
          {activeTournament ? (
            <Link href="/tournaments/active" className="group block bg-emerald-600 hover:bg-emerald-500 rounded-xl p-7 transition-all duration-200 border border-emerald-500">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl mb-2">⚡</div>
                  <h2 className="text-2xl font-bold text-white mb-1">Active Tournament</h2>
                  <p className="text-emerald-100">Record games and manage the current tournament</p>
                </div>
                <div className="text-emerald-200 group-hover:text-white text-3xl transition-colors">→</div>
              </div>
            </Link>
          ) : (
            <Link href="/tournaments/new" className="group block bg-emerald-600 hover:bg-emerald-500 rounded-xl p-7 transition-all duration-200 border border-emerald-500">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl mb-2">➕</div>
                  <h2 className="text-2xl font-bold text-white mb-1">New Tournament</h2>
                  <p className="text-emerald-100">Set up round robin, bracket format, and best-of</p>
                </div>
                <div className="text-emerald-200 group-hover:text-white text-3xl transition-colors">→</div>
              </div>
            </Link>
          )}
        </div>

        {/* Secondary nav */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Link href="/players" className="group bg-zinc-900 hover:bg-zinc-800 rounded-xl p-6 border border-zinc-700 hover:border-zinc-500 transition-all duration-200">
            <div className="text-3xl mb-3">👥</div>
            <h3 className="text-lg font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">Players & Stats</h3>
            <p className="text-zinc-400 text-sm">Leaderboard, win rates, and player history</p>
          </Link>

          <Link href="/tournaments/history" className="group bg-zinc-900 hover:bg-zinc-800 rounded-xl p-6 border border-zinc-700 hover:border-zinc-500 transition-all duration-200">
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-lg font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">Tournament History</h3>
            <p className="text-zinc-400 text-sm">Past tournaments, brackets, and results</p>
          </Link>
        </div>

      </div>
    </div>
  );
}


