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
                  complete ? 'bg-green-500' : active ? 'bg-blue-500' : 'bg-gray-200'
                }`}
                title={`Round ${roundNum}${complete ? ' ✓' : ''}`}
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

      {/* Current round matches */}
      <div>
        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Current Matches</h4>
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
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-8 py-3.5 rounded-xl font-bold text-base shadow-sm transition-colors border-2 border-blue-700"
            >
              ⏭ Next Round
            </button>
          ) : (
            <button
              onClick={() => onStartBracket(tournament)}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white px-8 py-3.5 rounded-xl font-bold text-base shadow-sm transition-colors border-2 border-purple-700"
            >
              🏆 Start Bracket
            </button>
          )}
        </div>
      )}
    </div>
  );
}
