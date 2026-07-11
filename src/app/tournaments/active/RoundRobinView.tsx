'use client';

import { useState } from 'react';
import { Tournament, Match } from '../../../types/pingpong';
import MatchCard from './MatchCard';
import Leaderboard from './Leaderboard';

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
      <Leaderboard tournament={tournament} getPlayerName={getPlayerName} />

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
