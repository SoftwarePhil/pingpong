'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tournament, Player, Match, Game } from '../../../types/pingpong';
import Link from 'next/link';
import BracketView from '../active/BracketView';

type DetailTab = 'overview' | 'matches';

function TournamentHistoryContent() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const searchParams = useSearchParams();

  useEffect(() => {
    fetchTournaments();
    fetchPlayers();
    fetchGames();
  }, []);

  // Auto-select tournament from ?id= query param once data is loaded
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && tournaments.length > 0 && !selectedTournament) {
      const t = tournaments.find(t => t.id === id);
      if (t) { setSelectedTournament(t); setActiveTab('overview'); }
    }
  }, [searchParams, tournaments]);

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    setTournaments(data);
  };

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

  const getPlayerName = (id: string) => {
    if (id === 'BYE') return 'BYE';
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  const getPlayerStandings = (tournament: Tournament) => {
    const playerStats: { [playerId: string]: { wins: number; losses: number; totalGames: number } } = {};
    tournament.players.forEach(playerId => {
      playerStats[playerId] = { wins: 0, losses: 0, totalGames: 0 };
    });

    (tournament.matches || []).forEach(match => {
      if (match.winnerId && match.player2Id !== 'BYE') {
        playerStats[match.winnerId].wins++;
        playerStats[match.winnerId].totalGames++;
        const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
        if (loserId && playerStats[loserId]) {
          playerStats[loserId].losses++;
          playerStats[loserId].totalGames++;
        }
      }
    });

    return tournament.players
      .map(playerId => ({ playerId, ...playerStats[playerId] }))
      .sort((a, b) => {
        if (a.wins !== b.wins) return b.wins - a.wins;
        return a.totalGames - b.totalGames;
      });
  };

  const getChampion = (tournament: Tournament): string | null => {
    const bracketMatches = (tournament.matches || []).filter(m => m.round === 'bracket');
    if (bracketMatches.length === 0) return null;
    const maxRound = Math.max(...bracketMatches.map(m => m.bracketRound || 0));
    const finalMatch = bracketMatches.find(m => m.bracketRound === maxRound);
    return finalMatch?.winnerId ?? null;
  };

  const getTournamentGames = (tournament: Tournament) => {
    const matchIds = new Set((tournament.matches || []).map(m => m.id));
    return games.filter(g => g.matchId && matchIds.has(g.matchId));
  };

  const completedTournaments = [...tournaments]
    .filter(t => t.status === 'completed')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const activeTournament = tournaments.find(t => t.status !== 'completed') ?? null;

  const openDetail = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setActiveTab('overview');
  };

  const closeDetail = () => setSelectedTournament(null);

  // ── Full-screen detail view ──────────────────────────────────────────────
  if (selectedTournament) {
    const champ = getChampion(selectedTournament);
    const bracketMatches = (selectedTournament.matches || []).filter(m => m.round === 'bracket');
    const allMatches = selectedTournament.matches || [];
    const rrMatches = allMatches.filter(m => m.round === 'roundRobin').sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));
    const brMatches = allMatches.filter(m => m.round === 'bracket').sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));

    const renderMatch = (match: Match) => {
      const p1Won = match.winnerId === match.player1Id;
      const p2Won = match.winnerId === match.player2Id;
      return (
        <div key={match.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-[var(--surface)] px-4 py-2 text-sm">
            <span className={`font-semibold ${p1Won ? 'text-win' : 'text-[var(--text)]'}`}>
              {getPlayerName(match.player1Id)}{p1Won && ' 🏆'}
            </span>
            <span className="text-dim font-medium">vs</span>
            <span className={`font-semibold ${p2Won ? 'text-win' : 'text-[var(--text)]'}`}>
              {match.player2Id === 'BYE' ? 'BYE' : getPlayerName(match.player2Id)}{p2Won && ' 🏆'}
            </span>
          </div>
          {match.games.length > 0 && (
            <div className="divide-y divide-[var(--border)]">
              {match.games.map((game, gi) => {
                const g1Won = game.score1 > game.score2;
                return (
                  <div key={game.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-muted w-14">Game {gi + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className={`font-medium w-16 text-right ${g1Won ? 'text-win' : 'text-muted'}`}>{getPlayerName(game.player1Id)}</span>
                      <span className="font-bold text-[var(--text)] tabular-nums">{game.score1} – {game.score2}</span>
                      <span className={`font-medium w-16 ${!g1Won ? 'text-win' : 'text-muted'}`}>{getPlayerName(game.player2Id)}</span>
                    </div>
                    <span className="text-dim text-xs w-20 text-right">{new Date(game.date).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          )}
          {match.games.length === 0 && match.player2Id === 'BYE' && <div className="px-4 py-2 text-sm text-dim italic">Bye round</div>}
          {match.games.length === 0 && match.player2Id !== 'BYE' && <div className="px-4 py-2 text-sm text-dim italic">No games recorded</div>}
        </div>
      );
    };

    return (
      <div className="page">
        <div className="page-inner-narrow">

          {/* Header */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <button
                onClick={closeDetail}
                className="nav-back mb-4"
              >
                ← Back to History
              </button>
              <h1 className="display-lg">{selectedTournament.name}</h1>
              <p className="text-muted mt-1">
                {selectedTournament.players.length} players •{' '}
                {new Date(selectedTournament.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              {champ && (
                <div className="mt-3 inline-flex items-center gap-2 bg-[rgba(232,184,74,0.08)] border border-[var(--border-gold)] rounded-lg px-3 py-1.5 text-sm font-semibold text-gold">
                  🥇 Champion: {getPlayerName(champ)}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs-pill mb-6">
            {(['overview', 'matches'] as DetailTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`tab-pill ${activeTab === tab ? 'tab-pill-active' : ''}`}
              >
                {tab === 'overview' ? 'Bracket & Standings' : 'Matches'}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {bracketMatches.length > 0 ? (
                <BracketView
                  bracketMatches={bracketMatches}
                  getPlayerName={getPlayerName}
                  onAddGame={async () => {}}
                  onSaveGameEdit={async () => {}}
                  readOnly
                />
              ) : (
                <p className="text-dim text-sm text-center py-4">No bracket matches recorded.</p>
              )}

              <div className="bg-[var(--surface)] rounded-lg shadow-none border border-[var(--border)] p-6">
                <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Standings</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-[var(--border)] text-muted">
                      <th className="text-left py-2 pr-4 font-semibold w-10">Rank</th>
                      <th className="text-left py-2 pr-4 font-semibold">Player</th>
                      <th className="text-center py-2 px-3 font-semibold">Wins</th>
                      <th className="text-center py-2 px-3 font-semibold">Losses</th>
                      <th className="text-center py-2 px-3 font-semibold">Win %</th>
                      <th className="text-center py-2 px-3 font-semibold">Matches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPlayerStandings(selectedTournament).map((s, i) => (
                      <tr key={s.playerId} className={`border-b border-[var(--border)] ${i === 0 ? 'bg-[rgba(232,184,74,0.08)] font-semibold' : i === 1 ? 'bg-[var(--surface)]' : ''}`}>
                        <td className="py-3 pr-4 text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</td>
                        <td className="py-3 pr-4 font-medium text-[var(--text)]">{getPlayerName(s.playerId)}</td>
                        <td className="text-center py-3 px-3 text-win font-medium">{s.wins}</td>
                        <td className="text-center py-3 px-3 text-loss font-medium">{s.losses}</td>
                        <td className="text-center py-3 px-3 text-[var(--text)]">{s.totalGames > 0 ? Math.round((s.wins / s.totalGames) * 100) : 0}%</td>
                        <td className="text-center py-3 px-3 text-muted">{s.totalGames}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid grid-cols-3 gap-4 mt-6">
                  {[
                    { label: 'Matches', value: allMatches.filter(m => m.winnerId).length },
                    { label: 'Games', value: getTournamentGames(selectedTournament).length },
                    { label: 'Players', value: selectedTournament.players.length },
                  ].map(stat => (
                    <div key={stat.label} className="bg-[var(--surface)] rounded-lg p-4 text-center border border-[var(--border)]">
                      <div className="text-2xl font-bold text-[var(--text)]">{stat.value}</div>
                      <div className="text-sm text-muted">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Matches Tab */}
          {activeTab === 'matches' && (
            <div className="space-y-6">
              {rrMatches.length > 0 && (
                <div className="bg-[var(--surface)] rounded-lg shadow-none border border-[var(--border)] p-6">
                  <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Round Robin</h4>
                  <div className="space-y-2">{rrMatches.map(renderMatch)}</div>
                </div>
              )}
              {brMatches.length > 0 && (
                <div className="bg-[var(--surface)] rounded-lg shadow-none border border-[var(--border)] p-6">
                  <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Bracket</h4>
                  <div className="space-y-4">
                    {Array.from(new Set(brMatches.map(m => m.bracketRound || 0))).sort((a, b) => a - b).map(round => (
                      <div key={round}>
                        <div className="text-xs text-dim font-medium mb-2 ml-1">Round {round}</div>
                        <div className="space-y-2">{brMatches.filter(m => (m.bracketRound || 0) === round).map(renderMatch)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {allMatches.length === 0 && <p className="text-muted text-center py-8">No matches recorded.</p>}
            </div>
          )}

        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-inner-narrow">

        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div>
            <p className="eyebrow mb-3">archive</p>
            <h1 className="display-lg">History</h1>
            <p className="text-muted mt-1 font-mono text-sm">
              {completedTournaments.length} completed
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Link href="/" className="nav-back">← Home</Link>
            {activeTournament ? (
              <Link href="/tournaments/active" className="btn btn-primary btn-sm">
                Active →
              </Link>
            ) : (
              <Link href="/tournaments/new" className="btn btn-primary btn-sm">
                + New
              </Link>
            )}
          </div>
        </div>

        {/* Tournament Cards */}
        {completedTournaments.length === 0 ? (
          <div className="text-center py-20 bg-[var(--surface)] rounded-lg shadow-none border border-[var(--border)]">
            <div className="text-6xl mb-4">🏆</div>
            <h3 className="text-xl font-semibold text-[var(--text)] mb-2">No completed tournaments yet</h3>
            <p className="text-muted mb-6">Complete some tournaments to see them here.</p>
            <Link href={activeTournament ? '/tournaments/active' : '/tournaments/new'} className="bg-[var(--gold)] hover:bg-[var(--gold-bright)] text-[#0a0908] px-6 py-3 rounded-lg font-medium transition-colors">
              {activeTournament ? '⚡ Active Tournament' : '+ New Tournament'}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {completedTournaments.map((tournament, idx) => {
              const standings = getPlayerStandings(tournament);
              const champion = getChampion(tournament);
              const tournamentGames = getTournamentGames(tournament);
              const completedMatches = (tournament.matches || []).filter(m => m.winnerId);
              const isLatest = idx === 0;

              return (
                <div
                  key={tournament.id}
                  className={`bg-[var(--surface)] rounded-lg shadow-none border-2 transition-shadow-none  ${isLatest ? 'border-[var(--border-gold)]' : 'border-[var(--border)]'}`}
                >
                  {/* Card Header */}
                  <div className={`px-6 py-4 rounded-t-xl flex justify-between items-center ${isLatest ? 'bg-[rgba(232,184,74,0.06)]' : 'bg-[var(--bg-elevated)]'}`}>
                    <div className="flex items-center gap-3">
                      {isLatest && <span className="badge badge-gold">Latest</span>}
                      <h2 className="text-lg font-bold text-[var(--text)]">{tournament.name}</h2>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted">
                      <span>{tournament.players.length} players</span>
                      <span>{new Date(tournament.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-6 py-5 flex flex-col md:flex-row gap-6">

                    {/* Champion */}
                    <div className="flex-shrink-0 flex flex-col items-center justify-center bg-gradient-to-br from-[rgba(232,184,74,0.1)] to-[rgba(232,184,74,0.04)] border border-[var(--border-gold)] rounded-lg px-8 py-5 min-w-[160px]">
                      <div className="text-4xl mb-1">🥇</div>
                      <div className="text-xs font-semibold text-gold uppercase tracking-wider mb-1">Champion</div>
                      <div className="text-base font-bold text-[var(--text)] text-center">
                        {champion ? getPlayerName(champion) : '—'}
                      </div>
                    </div>

                    {/* Standings */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Final Standings</div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-muted border-b border-[var(--border)]">
                            <th className="text-left py-1 pr-3 font-medium w-8">#</th>
                            <th className="text-left py-1 pr-3 font-medium">Player</th>
                            <th className="text-center py-1 px-2 font-medium w-12">W</th>
                            <th className="text-center py-1 px-2 font-medium w-12">L</th>
                            <th className="text-center py-1 px-2 font-medium w-16">Win%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((s, i) => (
                            <tr key={s.playerId} className={`border-b border-[var(--border)] ${i === 0 ? 'font-semibold text-[var(--text)]' : 'text-[var(--text)]'}`}>
                              <td className="py-1 pr-3 text-dim">
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                              </td>
                              <td className="py-1 pr-3">{getPlayerName(s.playerId)}</td>
                              <td className="text-center py-1 px-2 text-win">{s.wins}</td>
                              <td className="text-center py-1 px-2 text-loss">{s.losses}</td>
                              <td className="text-center py-1 px-2 text-muted">
                                {s.totalGames > 0 ? Math.round((s.wins / s.totalGames) * 100) : 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Quick Stats + Details Button */}
                    <div className="flex-shrink-0 flex flex-col justify-between gap-4 min-w-[130px]">
                      <div className="space-y-2">
                        <div className="bg-[var(--surface)] rounded-lg px-4 py-3 text-center">
                          <div className="text-2xl font-bold text-[var(--text)]">{completedMatches.length}</div>
                          <div className="text-xs text-muted">Matches</div>
                        </div>
                        <div className="bg-[var(--surface)] rounded-lg px-4 py-3 text-center">
                          <div className="text-2xl font-bold text-[var(--text)]">{tournamentGames.length}</div>
                          <div className="text-xs text-muted">Games</div>
                        </div>
                      </div>
                      <button
                        onClick={() => openDetail(tournament)}
                        className="btn btn-primary btn-sm w-full"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

export default function TournamentHistoryPage() {
  return (
    <Suspense>
      <TournamentHistoryContent />
    </Suspense>
  );
}

