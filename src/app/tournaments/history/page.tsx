'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tournament, Player, Match, Game, MARKER_PLAYER_ID } from '../../../types/pingpong';
import Link from 'next/link';
import { BracketView } from '@/bracket';
import { PageHeader } from '../../../components/PageHeader';
import TournamentPointsPanel from './TournamentPointsPanel';
import { getTournamentDateKey } from '../../../lib/tournamentPoints';
import { getGameSides, getMatchSides, getWinningSide, isMatchComplete } from '../../../lib/matchFormat';
import { getIndividualStandings } from '../../../lib/standings';

type DetailTab = 'overview' | 'matches';

function TournamentHistoryContent() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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
    if (id === MARKER_PLAYER_ID) return 'Marker';
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  const getPlayerStandings = (tournament: Tournament) => {
    const playerStats = getIndividualStandings(tournament.players, tournament.matches || []);

    return tournament.players
      .map(playerId => ({
        playerId,
        wins: playerStats[playerId].wins,
        losses: playerStats[playerId].losses,
        totalGames: playerStats[playerId].played,
      }))
      .sort((a, b) => {
        if (a.wins !== b.wins) return b.wins - a.wins;
        return a.totalGames - b.totalGames;
      });
  };

  const getChampionName = (tournament: Tournament): string | null => {
    const bracketMatches = (tournament.matches || []).filter(m => m.round === 'bracket');
    if (bracketMatches.length === 0) return null;
    const maxRound = Math.max(...bracketMatches.map(m => m.bracketRound || 0));
    const finalMatch = bracketMatches.find(m => m.bracketRound === maxRound && !m.isThirdPlace);
    if (!finalMatch || !isMatchComplete(finalMatch)) return null;
    return getMatchSides(finalMatch)[getWinningSide(finalMatch)! - 1].map(getPlayerName).join(' + ');
  };

  const getTournamentGames = (tournament: Tournament) => {
    const matchIds = new Set((tournament.matches || []).map(m => m.id));
    return games.filter(g => g.matchId && matchIds.has(g.matchId));
  };

  const completedTournaments = [...tournaments]
    .filter(t => t.status === 'completed')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const dateRangeError = fromDate && toDate && fromDate > toDate;
  const visibleTournaments = dateRangeError
    ? completedTournaments
    : completedTournaments.filter(tournament => {
      const date = getTournamentDateKey(tournament.startDate);
      return date && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });

  const activeTournament = tournaments.find(t => t.status !== 'completed') ?? null;

  const openDetail = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setActiveTab('overview');
  };

  const closeDetail = () => setSelectedTournament(null);

  // ── Full-screen detail view ──────────────────────────────────────────────
  if (selectedTournament) {
    const champName = getChampionName(selectedTournament);
    const bracketMatches = (selectedTournament.matches || []).filter(m => m.round === 'bracket');
    const allMatches = selectedTournament.matches || [];
    const rrMatches = allMatches.filter(m => m.round === 'roundRobin').sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));
    const brMatches = allMatches.filter(m => m.round === 'bracket').sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));

    const renderMatch = (match: Match) => {
      const [side1, side2] = getMatchSides(match);
      const winningSide = getWinningSide(match);
      const p1Won = winningSide === 1;
      const p2Won = winningSide === 2;
      const sideName = (side: string[]) => side.map(getPlayerName).join(' + ');
      return (
        <div key={match.id} className="border border-line rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-surface-sunken px-4 py-2 text-sm">
            <span className={`font-semibold ${p1Won ? 'text-win' : 'text-ink-soft'}`}>
              {sideName(side1)}{p1Won && ' 🏆'}
            </span>
            <span className="text-muted font-medium">vs</span>
            <span className={`font-semibold ${p2Won ? 'text-win' : 'text-ink-soft'}`}>
              {sideName(side2)}{p2Won && ' 🏆'}
            </span>
          </div>
          {match.games.length > 0 && (
            <div className="divide-y divide-line">
              {match.games.map((game, gi) => {
                const g1Won = game.score1 > game.score2;
                return (
                  <div key={game.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-muted w-14">Game {gi + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className={`font-medium w-16 text-right ${g1Won ? 'text-win' : 'text-ink-soft'}`}>{getGameSides(game)[0].map(getPlayerName).join(' + ')}</span>
                      <span className="font-bold text-ink tabular-nums">{game.score1} – {game.score2}</span>
                      <span className={`font-medium w-16 ${!g1Won ? 'text-win' : 'text-ink-soft'}`}>{getGameSides(game)[1].map(getPlayerName).join(' + ')}</span>
                    </div>
                    <span className="text-muted text-xs w-20 text-right">{new Date(game.date).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          )}
          {match.games.length === 0 && (side1.includes('BYE') || side2.includes('BYE')) && <div className="px-4 py-2 text-sm text-muted italic">Bye round</div>}
          {match.games.length === 0 && !(side1.includes('BYE') || side2.includes('BYE')) && <div className="px-4 py-2 text-sm text-muted italic">No games recorded</div>}
        </div>
      );
    };

    return (
      <div className="app-shell">
        <div className="page-container page-container--narrow">

          {/* Header */}
          <PageHeader
            title={selectedTournament.name}
            description={
              <>
                {selectedTournament.players.length} players •{' '}
                {new Date(selectedTournament.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </>
            }
            actions={
              <button type="button" onClick={closeDetail} className="text-sm font-semibold text-table hover:underline">
                ← All tournaments
              </button>
            }
          />
          {champName && (
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold-soft px-3 py-1 text-sm font-semibold text-ink">
              <span className="label-caps text-gold">Champion</span> {champName}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-surface rounded-xl border border-line p-1 w-fit">
            {(['overview', 'matches'] as DetailTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-table text-surface' : 'text-ink-soft hover:bg-surface-sunken'
                }`}
              >
                {tab === 'overview' ? '🏆 Bracket & Standings' : 'Matches'}
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
                  players={players}
                  showThirdPlace={selectedTournament.bracketConfig?.thirdPlaceMatch === true || bracketMatches.some(m => m.isThirdPlace)}
                  readOnly
                />
              ) : (
                <p className="text-muted text-sm text-center py-4">No bracket matches recorded.</p>
              )}

              <div className="bg-surface rounded-xl border border-line p-6">
                <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Standings</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-line text-ink-soft">
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
                      <tr key={s.playerId} className={`border-b border-line ${i === 0 ? 'bg-gold-soft font-semibold' : i === 1 ? 'bg-surface-sunken' : ''}`}>
                        <td className="py-3 pr-4 text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</td>
                        <td className="py-3 pr-4 font-medium text-ink">{getPlayerName(s.playerId)}</td>
                        <td className="text-center py-3 px-3 text-win font-medium">{s.wins}</td>
                        <td className="text-center py-3 px-3 text-loss font-medium">{s.losses}</td>
                        <td className="text-center py-3 px-3 text-ink-soft">{s.totalGames > 0 ? Math.round((s.wins / s.totalGames) * 100) : 0}%</td>
                        <td className="text-center py-3 px-3 text-muted">{s.totalGames}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid grid-cols-3 gap-4 mt-6">
                  {[
                    { label: 'Matches', value: allMatches.filter(isMatchComplete).length },
                    { label: 'Games', value: getTournamentGames(selectedTournament).length },
                    { label: 'Players', value: selectedTournament.players.length },
                  ].map(stat => (
                    <div key={stat.label} className="bg-surface-sunken rounded-lg p-4 text-center border border-line">
                      <div className="text-2xl font-bold text-ink">{stat.value}</div>
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
                <div className="bg-surface rounded-xl border border-line p-6">
                  <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Round Robin</h4>
                  <div className="space-y-2">{rrMatches.map(renderMatch)}</div>
                </div>
              )}
              {brMatches.length > 0 && (
                <div className="bg-surface rounded-xl border border-line p-6">
                  <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Bracket</h4>
                  <div className="space-y-4">
                    {Array.from(new Set(brMatches.map(m => m.bracketRound || 0))).sort((a, b) => a - b).map(round => (
                      <div key={round}>
                        <div className="text-xs text-muted font-medium mb-2 ml-1">
                          {brMatches.some(m => (m.bracketRound || 0) === round && m.isThirdPlace)
                            ? brMatches.some(m => (m.bracketRound || 0) === round && !m.isThirdPlace)
                              ? 'Final and third place'
                              : 'Third place'
                            : `Round ${round}`}
                        </div>
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
    <div className="app-shell">
      <div className="page-container page-container--narrow">

        {/* Header */}
        <PageHeader
          title="Tournament history"
          description={`${visibleTournaments.length} completed tournament${visibleTournaments.length !== 1 ? 's' : ''}`}
          actions={activeTournament && (
            <Link href="/tournaments/active" className="button button-primary">Go to the live tournament</Link>
          )}
        />

        {completedTournaments.length > 0 && (
          <TournamentPointsPanel
            tournaments={completedTournaments}
            players={players}
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
          />
        )}

        {/* Tournament Cards */}
        {completedTournaments.length === 0 ? (
          <div className="text-center py-20 bg-surface rounded-xl shadow border border-line">
            <h3 className="text-xl font-semibold text-ink mb-2">No completed tournaments yet</h3>
            <p className="text-muted mb-6">Complete some tournaments to see them here.</p>
            <Link href={activeTournament ? '/tournaments/active' : '/tournaments/new'} className="bg-table hover:bg-table-hover text-surface px-6 py-3 rounded-lg font-medium transition-colors">
              {activeTournament ? 'Go to the live tournament' : 'Start a tournament'}
            </Link>
          </div>
        ) : visibleTournaments.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl shadow border border-line">
            <h3 className="text-xl font-semibold text-ink mb-2">No tournaments in this date range</h3>
            <p className="text-muted mb-6">Adjust the dates above to see completed tournaments.</p>
            <button
              type="button"
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="button button-secondary"
            >
              Clear date range
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTournaments.map((tournament, idx) => {
              const standings = getPlayerStandings(tournament);
              const champion = getChampionName(tournament);
              const tournamentGames = getTournamentGames(tournament);
              const completedMatches = (tournament.matches || []).filter(isMatchComplete);
              const isLatest = idx === 0;

              return (
                <div
                  key={tournament.id}
                  className={`bg-surface rounded-xl border transition-shadow ${isLatest ? 'border-gold/40' : 'border-line'}`}
                >
                  {/* Card Header */}
                  <div className={`px-6 py-4 rounded-t-xl flex justify-between items-center ${isLatest ? 'bg-gold-soft' : 'bg-surface-sunken'}`}>
                    <div className="flex items-center gap-3">
                      {isLatest && <span className="text-xs font-bold bg-gold text-ink px-2 py-0.5 rounded-full uppercase tracking-wide">Latest</span>}
                      <h2 className="text-lg font-bold text-ink">{tournament.name}</h2>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted">
                      <span>{tournament.players.length} players</span>
                      <span>{new Date(tournament.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-6 py-5 flex flex-col md:flex-row gap-6">

                    {/* Champion */}
                    <div className="flex-shrink-0 flex flex-col items-center justify-center bg-gold-soft border border-gold/40 rounded-xl px-8 py-5 min-w-[160px]">
                      <div className="text-4xl mb-1">🥇</div>
                      <div className="text-xs font-semibold text-gold uppercase tracking-wider mb-1">Champion</div>
                      <div className="text-base font-bold text-ink text-center">
                        {champion ?? '—'}
                      </div>
                    </div>

                    {/* Standings */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Final Standings</div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-muted border-b border-line">
                            <th className="text-left py-1 pr-3 font-medium w-8">#</th>
                            <th className="text-left py-1 pr-3 font-medium">Player</th>
                            <th className="text-center py-1 px-2 font-medium w-12">W</th>
                            <th className="text-center py-1 px-2 font-medium w-12">L</th>
                            <th className="text-center py-1 px-2 font-medium w-16">Win%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((s, i) => (
                            <tr key={s.playerId} className={`border-b border-line ${i === 0 ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                              <td className="py-1 pr-3 text-muted">
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
                        <div className="bg-surface-sunken rounded-lg px-4 py-3 text-center">
                          <div className="text-2xl font-bold text-ink">{completedMatches.length}</div>
                          <div className="text-xs text-muted">Matches</div>
                        </div>
                        <div className="bg-surface-sunken rounded-lg px-4 py-3 text-center">
                          <div className="text-2xl font-bold text-ink">{tournamentGames.length}</div>
                          <div className="text-xs text-muted">Games</div>
                        </div>
                      </div>
                      <button
                        onClick={() => openDetail(tournament)}
                        className="w-full bg-table hover:bg-table-hover text-surface py-2 px-4 rounded-lg text-sm font-medium transition-colors"
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
