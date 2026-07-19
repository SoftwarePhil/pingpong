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

  const currentRound = rrMatches.length > 0
    ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1))
    : 1;

  const currentRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === currentRound);
  const allCurrentComplete  = currentRoundMatches.length > 0 && currentRoundMatches.every(m => m.winnerId);
  const isLastRound         = currentRound >= tournament.roundRobinRounds;

  const [manualRound, setManualRound] = useState<number | null>(null);
  const selectedRound = manualRound ?? currentRound;
  const isViewingCurrentRound = selectedRound === currentRound;
  const selectedRoundMatches = isViewingCurrentRound
    ? currentRoundMatches
    : rrMatches.filter(m => (m.bracketRound ?? 1) === selectedRound);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="display-sm">Round Robin</h3>
          <p className="text-sm text-muted mt-1 font-mono">
            Round <span className="text-gold">{currentRound}</span>
            <span className="text-dim"> / {tournament.roundRobinRounds}</span>
          </p>
        </div>

        <div className="flex gap-2 items-center">
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
                className={`w-3 h-3 rounded-full transition-all border ${
                  complete
                    ? 'bg-[var(--win)] border-[var(--win)]'
                    : isCurrent
                    ? 'bg-[var(--gold)] border-[var(--gold)]'
                    : 'bg-transparent border-[var(--border-strong)]'
                } ${isSelected ? 'ring-2 ring-[var(--gold)] ring-offset-2 ring-offset-[var(--bg)] scale-110' : ''} ${
                  reachable ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed opacity-40'
                }`}
              />
            );
          })}
        </div>
      </div>

      <Leaderboard tournament={tournament} getPlayerName={getPlayerName} />

      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="eyebrow" style={{ margin: 0 }}>
              {isViewingCurrentRound ? 'Current Matches' : `Round ${selectedRound} Matches`}
            </h4>
            {!isViewingCurrentRound && (
              <>
                <span className="badge">viewing past</span>
                <button
                  onClick={() => setManualRound(null)}
                  className="text-xs font-semibold text-gold hover:underline"
                >
                  Jump to current →
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => onRefreshMatches(tournament)}
            title="Regenerate matches for any active player who hasn't played the current round yet"
            className="btn btn-secondary btn-sm"
          >
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <p className="text-sm text-dim italic col-span-full">No matches in this round.</p>
          )}
        </div>
      </div>

      {isViewingCurrentRound && allCurrentComplete && (
        <div className="flex justify-center gap-3 pt-2">
          {!isLastRound ? (
            <button onClick={() => onAdvanceRound(tournament)} className="btn btn-primary btn-lg">
              Next Round →
            </button>
          ) : (
            <button onClick={() => onAddRound(tournament)} className="btn btn-primary btn-lg">
              + Add Another Round
            </button>
          )}
        </div>
      )}
    </div>
  );
}
