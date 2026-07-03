'use client';

import { useState } from 'react';
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
  onAddRound: (tournament: Tournament) => void;
  onRefreshMatches: (tournament: Tournament) => void;
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
  onAddRound,
  onRefreshMatches,
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

  // Which round is being displayed. `null` means "follow the current round" —
  // clicking a round dot pins the view to that round; clicking the current
  // round's dot again resumes auto-following as new rounds are created.
  const [manualRound, setManualRound] = useState<number | null>(null);
  const selectedRound = manualRound ?? currentRound;
  const isViewingCurrentRound = selectedRound === currentRound;
  const selectedRoundMatches = isViewingCurrentRound
    ? currentRoundMatches
    : rrMatches.filter(m => (m.bracketRound ?? 1) === selectedRound);

  // ── Standings across all RR rounds ───────────────────────────────────────
  const standings = (() => {
    const stats: Record<string, { wins: number; losses: number; played: number; pointDiff: number }> = {};
    tournament.players.forEach(p => { stats[p] = { wins: 0, losses: 0, played: 0, pointDiff: 0 }; });

    rrMatches.forEach(m => {
      if (!m.winnerId || m.player2Id === 'BYE') return;
      const loserId = m.player1Id === m.winnerId ? m.player2Id : m.player1Id;
      stats[m.winnerId].wins++;
      stats[m.winnerId].played++;
      if (stats[loserId]) { stats[loserId].losses++; stats[loserId].played++; }
      m.games.forEach(g => {
        stats[m.player1Id].pointDiff += g.score1 - g.score2;
        stats[m.player2Id].pointDiff += g.score2 - g.score1;
      });
    });

    return tournament.players
      .map(id => ({ id, ...stats[id] }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        return a.played - b.played;
      });
  })();

  return (
    <div className="space-y-8">
      {/* Round header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Round Robin</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Round <span className="font-semibold text-gray-700">{currentRound}</span> of{' '}
            <span className="font-semibold text-gray-700">{tournament.roundRobinRounds}</span>
          </p>
        </div>

        {/* Round progress dots — click any round to view/edit it below */}
        <div className="flex gap-2">
          {Array.from({ length: tournament.roundRobinRounds }, (_, i) => {
            const roundNum = i + 1;
            const roundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === roundNum);
            const complete = roundMatches.length > 0 && roundMatches.every(m => m.winnerId);
            const isCurrent  = roundNum === currentRound;
            const isSelected = roundNum === selectedRound;
            const reachable = roundNum <= currentRound;
            return (
              <button
                key={roundNum}
                type="button"
                disabled={!reachable}
                onClick={() => setManualRound(roundNum === currentRound ? null : roundNum)}
                aria-pressed={isSelected}
                aria-label={`View round ${roundNum}${complete ? ' (complete)' : isCurrent ? ' (current)' : ''}`}
                title={`Round ${roundNum}${complete ? ' ✓' : ''}${isSelected ? ' — viewing' : ''}`}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  complete ? 'bg-green-500' : isCurrent ? 'bg-blue-500' : 'bg-gray-200'
                } ${isSelected ? 'ring-2 ring-offset-1 ring-gray-500 scale-125' : ''} ${
                  reachable ? 'cursor-pointer hover:opacity-75' : 'cursor-not-allowed'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Standings table */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Standings</h4>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">Player</th>
              <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">W</th>
              <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">L</th>
              <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">+Pts</th>
              <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">Win%</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, idx) => {
              const pct = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
              const isLeader = idx < 2; // top 2 highlighted
              return (
                <tr key={s.id} className={`border-b border-gray-100 last:border-0 ${isLeader ? 'bg-amber-50' : 'bg-white'}`}>
                  <td className="px-4 py-2.5 text-gray-400 font-medium text-xs">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">
                    {isLeader && <span className="mr-1.5 text-amber-500">★</span>}
                    {getPlayerName(s.id)}
                  </td>
                  <td className="text-center px-3 py-2.5 font-bold text-green-700">{s.wins}</td>
                  <td className="text-center px-3 py-2.5 font-bold text-red-500">{s.losses}</td>
                  <td className={`text-center px-3 py-2.5 font-bold text-xs ${s.pointDiff > 0 ? 'text-green-600' : s.pointDiff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
                  </td>
                  <td className="text-center px-3 py-2.5 text-gray-500 text-xs font-medium">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected round's matches — same fully-editable card view whether it's
          the live current round or a past round selected via the dots above */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
              {isViewingCurrentRound ? 'Current Matches' : `Round ${selectedRound} Matches`}
            </h4>
            {!isViewingCurrentRound && (
              <>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                  viewing past round
                </span>
                <button
                  onClick={() => setManualRound(null)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
                >
                  Jump to current round →
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => onRefreshMatches(tournament)}
            title="Regenerate matches for any active player who hasn't played the current round yet (fixes duplicates/missing pairings). Always applies to the live current round, regardless of which round you're viewing."
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
          >
            🔄 Refresh Matches
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {selectedRoundMatches.map(match => (
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
          {selectedRoundMatches.length === 0 && (
            <p className="text-sm text-gray-400 italic col-span-full">No matches in this round.</p>
          )}
        </div>
      </div>

      {/* Advance round / add round CTA — only relevant while viewing the live current round */}
      {isViewingCurrentRound && allCurrentComplete && (
        <div className="flex justify-center gap-3 pt-2">
          {!isLastRound ? (
            <button
              onClick={() => onAdvanceRound(tournament)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-8 py-3.5 rounded-xl font-bold text-base shadow-sm transition-colors border-2 border-blue-700"
            >
              ⏭ Next Round
            </button>
          ) : (
            <button
              onClick={() => onAddRound(tournament)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-8 py-3.5 rounded-xl font-bold text-base shadow-sm transition-colors border-2 border-blue-700"
            >
              ➕ Add Another Round
            </button>
          )}
        </div>
      )}
    </div>
  );
}
