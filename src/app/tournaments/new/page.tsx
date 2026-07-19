'use client';

import { useState, useEffect } from 'react';
import { Player, Tournament, Game } from '../../../types/pingpong';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlayerSearchSelect } from '../../../components/PlayerSearchSelect';

export default function NewTournamentPage() {
  const router = useRouter();
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

  useEffect(() => {
    if (activeTournaments.length > 0) {
      router.replace('/tournaments/active');
    }
  }, [activeTournaments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const createTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || [...new Set(selectedPlayers)].length < 2) {
      alert('Please enter a tournament name and select at least 2 players');
      return;
    }

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
    <div className="page">
      <div className="page-inner-narrow">

        <div className="flex justify-between items-start mb-12">
          <div>
            <p className="eyebrow mb-3">setup</p>
            <h1 className="display-lg">New Tournament</h1>
            <p className="text-muted mt-2">Name it. Pick players. Set the format.</p>
          </div>
          <Link href="/" className="nav-back mt-2">← Home</Link>
        </div>

        {activeTournaments.length > 0 && (
          <div className="panel-gold p-6 mb-8">
            <p className="eyebrow mb-2">already live</p>
            <h3 className="display-sm mb-2">Active tournament in progress</h3>
            <p className="text-muted text-sm mb-4">
              <span className="text-gold font-semibold">&quot;{activeTournaments[0].name}&quot;</span>
              {' '}is running. One at a time.
            </p>
            <Link href="/tournaments/active" className="btn btn-primary btn-sm">
              View Active →
            </Link>
          </div>
        )}

        <div className={`panel-raised p-8 ${activeTournaments.length > 0 ? 'opacity-40 pointer-events-none' : ''}`}>
          <form onSubmit={createTournament} className="space-y-10">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Tournament Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Week 12 Thursday"
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Round Robin Rounds</label>
                <select
                  value={roundRobinRounds}
                  onChange={(e) => setRoundRobinRounds(parseInt(e.target.value))}
                  className="select"
                >
                  <option value={3}>3 Rounds</option>
                  <option value={4}>4 Rounds</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Best-of Format</label>
              <div className="panel p-5 space-y-4">
                {(
                  [
                    { label: 'Round Robin', value: rrBestOf, setter: setRrBestOf },
                    { label: 'Semifinals', value: semiBestOf, setter: setSemiBestOf },
                    { label: 'Finals', value: finalBestOf, setter: setFinalBestOf },
                  ] as { label: string; value: number; setter: (v: number) => void }[]
                ).map(({ label, value, setter }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-muted font-medium w-36">{label}</span>
                    <div className="flex gap-2">
                      {[1, 3, 5].map(bo => (
                        <button
                          key={bo}
                          type="button"
                          onClick={() => setter(bo)}
                          className={`btn btn-sm ${value === bo ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          Bo{bo}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Round Robin Pairing</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { value: 'random', label: 'Random', desc: 'Paired randomly each round' },
                  { value: 'top-vs-top', label: 'Top vs Top', desc: 'Strongest face strongest' },
                ] as { value: 'random' | 'top-vs-top'; label: string; desc: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRrPairingStrategy(opt.value)}
                    className={`text-left p-4 rounded-lg border transition-all ${
                      rrPairingStrategy === opt.value
                        ? 'border-[var(--border-gold)] bg-[rgba(232,184,74,0.08)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className={`font-semibold text-sm mb-1 ${rrPairingStrategy === opt.value ? 'text-gold' : ''}`}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-muted">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Select Players</label>
              <PlayerSearchSelect players={players} games={games} selected={selectedPlayers} onChange={setSelectedPlayers} />
              {players.length === 0 && (
                <p className="text-muted text-center py-8 text-sm">No players yet. Add some first.</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-[var(--border)]">
              <Link href="/" className="btn btn-secondary">Cancel</Link>
              <button type="submit" className="btn btn-primary btn-lg">
                Create Tournament
              </button>
            </div>
          </form>
        </div>

        {players.length === 0 && (
          <div className="empty-state panel mt-8">
            <div className="icon">◎</div>
            <h3 className="display-sm mb-2">No players available</h3>
            <p className="text-muted mb-6">Add players before starting a tournament.</p>
            <Link href="/players" className="btn btn-primary">Go to Players</Link>
          </div>
        )}
      </div>
    </div>
  );
}
