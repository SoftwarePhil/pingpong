'use client';

import { useState, useEffect } from 'react';
import { Player, Tournament } from '../../../types/pingpong';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NewTournamentPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [roundRobinRounds, setRoundRobinRounds] = useState(3);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  useEffect(() => {
    fetchPlayers();
    fetchTournaments();
  }, []);

  const fetchPlayers = async () => {
    const res = await fetch('/api/players');
    const data = await res.json();
    setPlayers(data);
  };

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    setTournaments(data);
  };

  const activeTournaments = tournaments.filter(t => t.status !== 'completed');

  const createTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || [...new Set(selectedPlayers)].length < 2) {
      alert('Please enter a tournament name and select at least 2 players');
      return;
    }

    // Check if there's already an active tournament
    if (activeTournaments.length > 0) {
      alert('There is already an active tournament: "' + activeTournaments[0].name + '". Please complete or end it before creating a new one.');
      return;
    }

    const bracketRounds = [{ round: 1, bestOf: 3 }, { round: 2, bestOf: 5 }];
    
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        roundRobinRounds,
        bracketRounds,
        players: [...new Set(selectedPlayers)],
      }),
    });
    
    if (res.ok) {
      alert('Tournament created successfully!');
      router.push('/tournaments/active');
    } else {
      const error = await res.json();
      alert(error.error || 'Failed to create tournament');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">➕ New Tournament</h1>
            <p className="text-gray-600 text-lg">Create a new ping pong tournament</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/tournaments" className="bg-white hover:bg-gray-100 text-gray-800 px-6 py-3 rounded-lg shadow border-2 border-gray-300 transition-colors font-medium">
              ← Back to Tournaments
            </Link>
            <Link href="/tournaments/active" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow font-medium transition-colors border-2 border-blue-700">
              View Active Tournaments
            </Link>
          </div>
        </div>

        {/* Active Tournament Warning */}
        {activeTournaments.length > 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 mb-8">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">Active Tournament in Progress</h3>
                <p className="text-yellow-700 mb-3">
                  There is currently an active tournament: <strong>&quot;{activeTournaments[0].name}&quot;</strong>
                </p>
                <p className="text-yellow-700 text-sm">
                  You can only have one active tournament at a time. Please complete or end the current tournament before creating a new one.
                </p>
                <div className="mt-4">
                  <Link
                    href="/tournaments/active"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium transition-colors border-2 border-yellow-700"
                  >
                    View Active Tournament →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Tournament Form */}
        <div className={`bg-white rounded-xl shadow-lg p-8 border-2 border-gray-200 ${activeTournaments.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Create New Tournament</h2>
          <form onSubmit={createTournament} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-lg font-semibold text-gray-800 mb-3">Tournament Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Week 1 Championship"
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none text-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-lg font-semibold text-gray-800 mb-3">Round Robin Rounds</label>
                <select
                  value={roundRobinRounds}
                  onChange={(e) => setRoundRobinRounds(parseInt(e.target.value))}
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none text-lg"
                >
                  <option value={3}>3 Rounds</option>
                  <option value={4}>4 Rounds</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-lg font-semibold text-gray-800 mb-4">Select Players</label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {players.map(p => (
                  <label key={p.id} className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border-2 border-gray-200">
                    <input
                      type="checkbox"
                      checked={selectedPlayers.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (!selectedPlayers.includes(p.id)) {
                            setSelectedPlayers([...selectedPlayers, p.id]);
                          }
                        } else {
                          setSelectedPlayers(selectedPlayers.filter(id => id !== p.id));
                        }
                      }}
                      className="w-5 h-5 text-blue-600 rounded border-2 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="font-medium text-gray-900 text-lg">{p.name}</span>
                  </label>
                ))}
              </div>
              {players.length === 0 && (
                <p className="text-gray-600 text-center py-8">No players available. Add some players first!</p>
              )}
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
              <Link
                href="/tournaments"
                className="px-8 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors font-medium text-lg"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-lg border-2 border-blue-700"
              >
                Create Tournament
              </button>
            </div>
          </form>
        </div>

        {players.length === 0 && (
          <div className="mt-8 text-center py-16 bg-white rounded-xl shadow-lg border-2 border-gray-200">
            <div className="text-8xl mb-6">👥</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">No players available</h3>
            <p className="text-gray-600 mb-8 text-lg">You need to add players before creating a tournament!</p>
            <Link href="/" className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-lg shadow-lg font-bold text-xl transition-colors border-2 border-blue-700 inline-block">
              Go to Home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}