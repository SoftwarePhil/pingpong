'use client';

import { useState, useEffect } from 'react';
import { Tournament } from '../../types/pingpong';
import Link from 'next/link';

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    setTournaments(data);
  };

  const activeTournaments = tournaments.filter(t => t.status !== 'completed');
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">🏓 Ping Pong Tournaments</h1>
            <p className="text-gray-600 text-lg">Track your weekly ping pong battles</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/" className="bg-white hover:bg-gray-100 text-gray-800 px-6 py-3 rounded-lg shadow border-2 border-gray-300 transition-colors font-medium">
              ← Back to Home
            </Link>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Link href="/tournaments/active" className="bg-white rounded-xl shadow-lg p-8 border-2 border-gray-200 hover:shadow-xl transition-shadow">
            <div className="text-center">
              <div className="text-6xl mb-4">⚡</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Active Tournaments</h3>
              <p className="text-gray-600 mb-6">View and manage ongoing tournaments</p>
              <div className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors inline-block">
                View Active →
              </div>
            </div>
          </Link>

          <Link href="/tournaments/history" className="bg-white rounded-xl shadow-lg p-8 border-2 border-gray-200 hover:shadow-xl transition-shadow">
            <div className="text-center">
              <div className="text-6xl mb-4">🏆</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Tournament History</h3>
              <p className="text-gray-600 mb-6">Browse completed tournaments and results</p>
              <div className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors inline-block">
                View History →
              </div>
            </div>
          </Link>

          <Link href="/tournaments/new" className={`bg-white rounded-xl shadow-lg p-8 border-2 border-gray-200 hover:shadow-xl transition-shadow ${activeTournaments.length > 0 ? 'opacity-75' : ''}`}>
            <div className="text-center">
              <div className="text-6xl mb-4">➕</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">New Tournament</h3>
              <p className="text-gray-600 mb-6">
                {activeTournaments.length > 0
                  ? `Active tournament: "${activeTournaments[0].name}"`
                  : 'Create a new tournament'
                }
              </p>
              <div className={`px-6 py-3 rounded-lg font-medium transition-colors inline-block ${
                activeTournaments.length > 0
                  ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}>
                {activeTournaments.length > 0 ? 'Complete Active First' : 'Create New →'}
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
