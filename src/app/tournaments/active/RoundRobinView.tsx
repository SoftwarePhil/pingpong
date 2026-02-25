'use client';

import { Tournament, Match } from '../../../types/pingpong';
import MatchCard from './MatchCard';

interface RoundRobinViewProps {
  tournament: Tournament;
  getPlayerName: (id: string) => string;
  onAddGame: (match: Match, score1: number, score2: number) => void;
  onDeleteMatch: (matchId: string) => void;
  onDeleteGame: (gameId: string) => void;
  onSaveGameEdit: (gameId: string, score1: number, score2: number) => void;
  onSwapPlayers: (matchId: string, p1: string, p2: string) => void;
  onAdvanceRound: (tournament: Tournament) => void;
  onStartBracket: (tournament: Tournament) => void;
}

export default function RoundRobinView({
  tournament,
  getPlayerName,
  onAddGame,
  onDeleteMatch,
  onDeleteGame,
  onSaveGameEdit,
  onSwapPlayers,
  onAdvanceRound,
  onStartBracket,
}: RoundRobinViewProps) {
  const allMatches = tournament.matches ?? [];
  const rrMatches  = allMatches.filter(m => m.round === 'roundRobin');

  // Current round = highest bracketRound among round-robin matches
  const currentRound = rrMatches.length > 0
    ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1))
    : 1;

  const currentRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === currentRound);
  const allCurrentComplete  = currentRoundMatches.length > 0 && currentRoundMatches.every(m => m.winnerId);
  const isLastRound         = currentRound >= tournament.roundRobinRounds;

  // ── Standings across all RR rounds ───────────────────────────────────────
  const standings = (() => {
    const stats: Record<string, { wins: number; losses: number; played: number }> = {};
    tournament.players.forEach(p => { stats[p] = { wins: 0, losses: 0, played: 0 }; });

    rrMatches.forEach(m => {
      if (!m.winnerId || m.player2Id === 'BYE') return;
      const loserId = m.player1Id === m.winnerId ? m.player2Id : m.player1Id;
      stats[m.winnerId].wins++;
      stats[m.winnerId].played++;
      if (stats[loserId]) { stats[loserId].losses++; stats[loserId].played++; }
    });

    return tournament.players
      .map(id => ({ id, ...stats[id] }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.played - b.played;
      });
  })();

  return (
    <div className="space-y-8">
      {/* Round header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-ink">Round Robin</h3>
          <p className="text-sm text-ink-muted mt-0.5">
            Round <span className="font-semibold text-ink-dim">{currentRound}</span> of{' '}
            <span className="font-semibold text-ink-dim">{tournament.roundRobinRounds}</span>
          </p>
        </div>

        {/* Round progress dots */}
        <div className="flex gap-2">
          {Array.from({ length: tournament.roundRobinRounds }, (_, i) => {
            const roundNum = i + 1;
            const roundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === roundNum);
            const complete = roundMatches.length > 0 && roundMatches.every(m => m.winnerId);
            const active   = roundNum === currentRound;
            return (
              <div key={roundNum}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  complete ? 'bg-brand-hi' : active ? 'bg-ink-dim' : 'bg-raised'
                }`}
                title={`Round ${roundNum}${complete ? ' ✓' : ''}`}
              />
            );
          })}
        </div>
      </div>

      {/* Standings table */}
      <div className="bg-surface border border-edge rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-edge bg-overlay">
          <h4 className="text-sm font-bold text-ink-dim uppercase tracking-wide">Standings</h4>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface">
              <th className="text-left px-4 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide">Player</th>
              <th className="text-center px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide">W</th>
              <th className="text-center px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide">L</th>
              <th className="text-center px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide">Win%</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, idx) => {
              const pct = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
              const isLeader = idx < 2; // top 2 highlighted
              return (
                <tr key={s.id} className={`border-b border-edge-dim last:border-0 ${isLeader ? 'bg-gold-dim/30' : 'bg-surface'}`}>
                  <td className="px-4 py-2.5 text-ink-faint font-medium text-xs">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-ink">
                    {isLeader && <span className="mr-1.5 text-gold">★</span>}
                    {getPlayerName(s.id)}
                  </td>
                  <td className="text-center px-3 py-2.5 font-bold text-win">{s.wins}</td>
                  <td className="text-center px-3 py-2.5 font-bold text-loss">{s.losses}</td>
                  <td className="text-center px-3 py-2.5 text-ink-muted text-xs font-medium">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Current round matches */}
      <div>
        <h4 className="text-sm font-bold text-ink-muted uppercase tracking-wide mb-4">Current Matches</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentRoundMatches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              tournamentPlayers={tournament.players}
              getPlayerName={getPlayerName}
              onAddGame={onAddGame}
              onDeleteMatch={onDeleteMatch}
              onDeleteGame={onDeleteGame}
              onSaveGameEdit={onSaveGameEdit}
              onSwapPlayers={onSwapPlayers}
            />
          ))}
        </div>
      </div>

      {/* Advance round / start bracket CTA */}
      {allCurrentComplete && (
        <div className="flex justify-center pt-2">
          {!isLastRound ? (
            <button
              onClick={() => onAdvanceRound(tournament)}
              className="inline-flex items-center gap-2 bg-overlay hover:bg-raised active:bg-raised text-ink px-8 py-3.5 rounded-xl font-bold text-base transition-colors border border-edge"
            >
              ⏭ Next Round
            </button>
          ) : (
            <button
              onClick={() => onStartBracket(tournament)}
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hi active:bg-brand text-ink px-8 py-3.5 rounded-xl font-bold text-base transition-colors border border-brand-hi"
            >
              🏆 Start Bracket
            </button>
          )}
        </div>
      )}
    </div>
  );
}
