'use client';

import { useState, useEffect } from 'react';
import { Player, Tournament, Game } from '../../../types/pingpong';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlayerSearchSelect } from '../../../components/PlayerSearchSelect';
import { useAuth } from '../../../components/AuthProvider';

export default function NewTournamentPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [roundRobinRounds, setRoundRobinRounds] = useState(3);
  const [rrBestOf, setRrBestOf] = useState(1);
  const [semiBestOf, setSemiBestOf] = useState(3);
  const [finalBestOf, setFinalBestOf] = useState(3);
  const [rrPairingStrategy, setRrPairingStrategy] = useState<'random' | 'top-vs-top'>('top-vs-top');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerError, setNewPlayerError] = useState<string | null>(null);
  const [creatingPlayer, setCreatingPlayer] = useState(false);

  useEffect(() => {
    if (!isAdmin) router.replace('/tournaments/active');
  }, [isAdmin, router]);

  useEffect(() => {
    fetchPlayers();
    fetchGames();
    fetchTournaments();
  }, []);

  const fetchPlayers = async () => {
    const res = await fetch('/api/players');
    const data = await res.json();
    setPlayers(data);
  };

  const createPlayerAndSelect = async () => {
    const trimmedName = newPlayerName.trim();
    if (!trimmedName || creatingPlayer) return;

    setCreatingPlayer(true);
    setNewPlayerError(null);
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName }),
    });

    if (res.ok) {
      const created: Player = await res.json();
      setPlayers(prev => [...prev, created]);
      setSelectedPlayers(prev => [...prev, created.id]);
      setNewPlayerName('');
      setShowNewPlayerForm(false);
    } else {
      const error = await res.json();
      setNewPlayerError(error.error ?? 'Failed to add player');
    }
    setCreatingPlayer(false);
  };

  const fetchGames = async () => {
    const res = await fetch('/api/games');
    const data = await res.json();
    setGames(data);
  };

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    setTournaments(data);
  };

  const activeTournaments = tournaments.filter(t => t.status !== 'completed');

  // Redirect immediately once we know there's an active tournament
  useEffect(() => {
    if (activeTournaments.length > 0) {
      router.replace('/tournaments/active');
    }
  }, [activeTournaments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) return null;

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

    const bracketRounds = [
      { matchCount: 1, bestOf: finalBestOf },
      { matchCount: 2, bestOf: semiBestOf },
    ];
    
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        roundRobinRounds,
        bracketRounds,
        rrBestOf,
        rrPairingStrategy,
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
            <Link href="/" className="bg-white hover:bg-gray-100 text-gray-800 px-6 py-3 rounded-lg shadow border-2 border-gray-300 transition-colors font-medium">
              ← Back
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

            {/* Best-of Format Settings */}
            <div>
              <label className="block text-lg font-semibold text-gray-800 mb-4">Format Settings</label>
              <div className="space-y-4 bg-gray-50 rounded-lg p-5 border-2 border-gray-200">
                {(
                  [
                    { label: 'Round Robin', value: rrBestOf, setter: setRrBestOf },
                    { label: 'Semifinals', value: semiBestOf, setter: setSemiBestOf },
                    { label: 'Finals', value: finalBestOf, setter: setFinalBestOf },
                  ] as { label: string; value: number; setter: (v: number) => void }[]
                ).map(({ label, value, setter }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-base font-medium text-gray-700 w-36">{label}</span>
                    <div className="flex space-x-2">
                      {[1, 3, 5].map(bo => (
                        <button
                          key={bo}
                          type="button"
                          onClick={() => setter(bo)}
                          className={`px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-colors ${
                            value === bo
                              ? 'bg-blue-600 text-white border-blue-700'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          Bo{bo}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Round Robin Pairing Strategy */}
            <div>
              <label className="block text-lg font-semibold text-gray-800 mb-4">Round Robin Pairing Strategy</label>
              <div className="flex gap-4">
                {([
                  { value: 'random', label: '🎲 Random', desc: 'Players are paired randomly each round' },
                  { value: 'top-vs-top', label: '🏆 Top vs Top', desc: 'Top-ranked players face each other for competitive matches' },
                ] as { value: 'random' | 'top-vs-top'; label: string; desc: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRrPairingStrategy(opt.value)}
                    className={`flex-1 p-4 rounded-lg border-2 text-left transition-colors ${
                      rrPairingStrategy === opt.value
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`font-semibold text-base mb-1 ${rrPairingStrategy === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</div>
                    <div className="text-sm text-gray-500">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
               <label className="block text-lg font-semibold text-gray-800 mb-4">Select Players</label>
               <PlayerSearchSelect players={players} games={games} selected={selectedPlayers} onChange={setSelectedPlayers} />
               <div className="mt-5 pt-4 border-t border-gray-200">
                 {!showNewPlayerForm ? (
                   <button
                     type="button"
                     onClick={() => { setShowNewPlayerForm(true); setNewPlayerError(null); }}
                     className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                   >
                     <span className="text-lg leading-none">+</span> Create New Player
                   </button>
                 ) : (
                   <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                     <p className="text-sm font-semibold text-gray-700 mb-3">New Player</p>
                     <div className="flex gap-2">
                       <input
                         type="text"
                         value={newPlayerName}
                         onChange={e => { setNewPlayerName(e.target.value); setNewPlayerError(null); }}
                         onKeyDown={e => { if (e.key === 'Enter' && newPlayerName.trim()) { e.preventDefault(); createPlayerAndSelect(); } }}
                         placeholder="Player name"
                         autoFocus
                         disabled={creatingPlayer}
                         className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
                       />
                       <button
                         type="button"
                         onClick={createPlayerAndSelect}
                         disabled={creatingPlayer || !newPlayerName.trim()}
                         className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {creatingPlayer ? 'Adding...' : 'Add'}
                       </button>
                       <button
                         type="button"
                         onClick={() => { setShowNewPlayerForm(false); setNewPlayerName(''); setNewPlayerError(null); }}
                         disabled={creatingPlayer}
                         className="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100 font-semibold transition-colors disabled:opacity-50"
                       >
                         Cancel
                       </button>
                     </div>
                     {newPlayerError && <p className="mt-2 text-sm text-red-600">{newPlayerError}</p>}
                   </div>
                 )}
               </div>
               {players.length === 0 && (
                 <p className="text-gray-600 text-center py-8">No players available. Add some players first!</p>
               )}
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
              <Link
                href="/"
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
