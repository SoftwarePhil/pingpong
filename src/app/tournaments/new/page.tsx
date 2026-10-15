'use client';

import { useState, useEffect } from 'react';
import { Player, Tournament, Game } from '../../../types/pingpong';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlayerSearchSelect } from '../../../components/PlayerSearchSelect';
import { useAuth } from '../../../components/AuthProvider';
import { PageHeader } from '../../../components/PageHeader';

export default function NewTournamentPage() {
  const router = useRouter();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [roundRobinRounds, setRoundRobinRounds] = useState(3);
  const [rrBestOf, setRrBestOf] = useState(1);
  const [semiBestOf, setSemiBestOf] = useState(3);
  const [finalBestOf, setFinalBestOf] = useState(3);
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(false);
  const [rrPairingStrategy, setRrPairingStrategy] = useState<'random' | 'top-vs-top' | 'swiss'>('swiss');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerError, setNewPlayerError] = useState<string | null>(null);
  const [creatingPlayer, setCreatingPlayer] = useState(false);

  // Only viewers are sent away; wait until the session check has finished so a
  // signed-in admin opening this URL directly is not redirected.
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/tournaments/active');
  }, [authLoading, isAdmin, router]);

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
        thirdPlaceMatch,
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
    <div className="app-shell">
      <div className="page-container page-container--narrow">
        <PageHeader
          title="New tournament"
          description="Pick the players, the number of round robin rounds and the bracket format."

        />

        {/* Active Tournament Warning */}
        {activeTournaments.length > 0 && (
          <div className="bg-gold-soft border border-gold/40 rounded-lg p-6 mb-8">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-lg font-semibold text-gold mb-2">Active Tournament in Progress</h3>
                <p className="text-gold mb-3">
                  There is currently an active tournament: <strong>&quot;{activeTournaments[0].name}&quot;</strong>
                </p>
                <p className="text-gold text-sm">
                  You can only have one active tournament at a time. Please complete or end the current tournament before creating a new one.
                </p>
                <div className="mt-4">
                  <Link
                    href="/tournaments/active"
                    className="bg-gold hover:bg-gold text-surface px-4 py-2 rounded-lg font-medium transition-colors border border-gold"
                  >
                    View Active Tournament →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Tournament Form */}
        <div className={`bg-surface rounded-xl p-8 border border-line ${activeTournaments.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <form onSubmit={createTournament} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-lg font-semibold text-ink mb-3">Tournament Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Week 1 Championship"
                  className="form-control w-full rounded-lg px-4 py-3 text-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-lg font-semibold text-ink mb-3">Round Robin Rounds</label>
                <select
                  value={roundRobinRounds}
                  onChange={(e) => setRoundRobinRounds(parseInt(e.target.value))}
                  className="form-control w-full rounded-lg px-4 py-3 text-lg"
                >
                  <option value={3}>3 Rounds</option>
                  <option value={4}>4 Rounds</option>
                </select>
              </div>
            </div>

            {/* Best-of Format Settings */}
            <div>
              <label className="block text-lg font-semibold text-ink mb-4">Format Settings</label>
              <div className="space-y-4 bg-surface-sunken rounded-lg p-5 border border-line">
                {(
                  [
                    { label: 'Round Robin', value: rrBestOf, setter: setRrBestOf },
                    { label: 'Semifinals', value: semiBestOf, setter: setSemiBestOf },
                    { label: 'Finals', value: finalBestOf, setter: setFinalBestOf },
                  ] as { label: string; value: number; setter: (v: number) => void }[]
                ).map(({ label, value, setter }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-base font-medium text-ink-soft w-36">{label}</span>
                    <div className="flex space-x-2">
                      {[1, 3, 5].map(bo => (
                        <button
                          key={bo}
                          type="button"
                          onClick={() => setter(bo)}
                          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition-colors ${
                            value === bo
                              ? 'bg-table text-surface border-table'
                              : 'bg-surface text-ink-soft border-line-strong hover:bg-surface-sunken'
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

            <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunken p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={thirdPlaceMatch}
                onChange={e => setThirdPlaceMatch(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--table)]"
              />
              <span>
                <span className="block text-base font-semibold text-ink">Play a third-place match</span>
                <span className="block text-sm text-muted mt-1">Create it after the semifinals so the semifinal losers can play for third place.</span>
              </span>
            </label>

            {/* Round Robin Pairing Strategy */}
            <div>
              <label className="block text-lg font-semibold text-ink mb-4">Round Robin Pairing Strategy</label>
              <div className="flex flex-col md:flex-row gap-4">
                {([
                  { value: 'swiss', label: 'Swiss', desc: 'Similar records play, rematches avoided, byes rotate' },
                  { value: 'top-vs-top', label: 'Top vs Top', desc: 'Top-ranked players face each other for competitive matches' },
                  { value: 'random', label: 'Random', desc: 'Players are paired randomly each round' },
                ] as { value: 'random' | 'top-vs-top' | 'swiss'; label: string; desc: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRrPairingStrategy(opt.value)}
                    className={`flex-1 p-4 rounded-lg border text-left transition-colors ${
                      rrPairingStrategy === opt.value
                        ? 'bg-table-soft border-table'
                        : 'bg-surface border-line-strong hover:bg-surface-sunken'
                    }`}
                  >
                    <div className={`font-semibold text-base mb-1 ${rrPairingStrategy === opt.value ? 'text-table' : 'text-ink'}`}>{opt.label}</div>
                    <div className="text-sm text-muted">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
               <label className="block text-lg font-semibold text-ink mb-4">Select Players</label>
               <PlayerSearchSelect players={players} games={games} selected={selectedPlayers} onChange={setSelectedPlayers} />
               <div className="mt-5 pt-4 border-t border-line">
                 {!showNewPlayerForm ? (
                   <button
                     type="button"
                     onClick={() => { setShowNewPlayerForm(true); setNewPlayerError(null); }}
                     className="flex items-center gap-2 text-sm text-table hover:text-table-hover font-semibold transition-colors"
                   >
                     <span className="text-lg leading-none">+</span> Create New Player
                   </button>
                 ) : (
                   <div className="bg-surface-sunken rounded-xl p-4 border border-line">
                     <p className="text-sm font-semibold text-ink-soft mb-3">New Player</p>
                     <div className="flex gap-2">
                       <input
                         type="text"
                         value={newPlayerName}
                         onChange={e => { setNewPlayerName(e.target.value); setNewPlayerError(null); }}
                         onKeyDown={e => { if (e.key === 'Enter' && newPlayerName.trim()) { e.preventDefault(); createPlayerAndSelect(); } }}
                         placeholder="Player name"
                         autoFocus
                         disabled={creatingPlayer}
                          className="form-control flex-1 rounded-lg px-3 py-2 text-sm disabled:bg-surface-sunken"
                       />
                       <button
                         type="button"
                         onClick={createPlayerAndSelect}
                         disabled={creatingPlayer || !newPlayerName.trim()}
                         className="px-4 py-2 bg-win hover:bg-win text-surface rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {creatingPlayer ? 'Adding...' : 'Add'}
                       </button>
                       <button
                         type="button"
                         onClick={() => { setShowNewPlayerForm(false); setNewPlayerName(''); setNewPlayerError(null); }}
                         disabled={creatingPlayer}
                         className="px-4 py-2 border border-line rounded-lg text-sm text-ink-soft hover:bg-surface-sunken font-semibold transition-colors disabled:opacity-50"
                       >
                         Cancel
                       </button>
                     </div>
                     {newPlayerError && <p className="mt-2 text-sm text-loss">{newPlayerError}</p>}
                   </div>
                 )}
               </div>
               {players.length === 0 && (
                 <p className="text-ink-soft text-center py-8">No players available. Add some players first!</p>
               )}
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t-2 border-line">
              <Link
                href="/"
                className="px-8 py-3 border border-line-strong rounded-lg text-ink-soft hover:bg-surface-sunken transition-colors font-medium text-lg"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-8 py-3 bg-table hover:bg-table-hover text-surface rounded-lg transition-colors font-medium text-lg border border-table"
              >
                Create Tournament
              </button>
            </div>
          </form>
        </div>

        {players.length === 0 && (
          <div className="mt-8 text-center py-16 bg-surface rounded-xl border border-line">
            <h3 className="text-xl font-semibold text-ink mb-2">No players yet</h3>
            <p className="text-ink-soft mb-6">Add players before creating a tournament.</p>
            <Link href="/players" className="button button-primary">Go to players</Link>
          </div>
        )}
      </div>
    </div>
  );
}
