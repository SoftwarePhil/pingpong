'use client';

import { useState } from 'react';
import { Player, Tournament, Match } from '../../../types/pingpong';
import MatchCard from './MatchCard';
import Leaderboard from './Leaderboard';
import { getRoundRobinFormat, isMatchComplete } from '../../../lib/matchFormat';

interface RoundRobinViewProps {
  tournament: Tournament;
  players: Player[];
  getPlayerName: (id: string) => string;
  onAddGame: (match: Match, score1: number, score2: number) => void;
  onDeleteMatch: (matchId: string) => void;
  onDeleteGame: (gameId: string) => void;
  onSaveGameEdit: (gameId: string, score1: number, score2: number) => void;
  onSwapPlayers: (matchId: string, p1: string, p2: string) => void;
  onAddMarker: (matchId: string) => void;
  onAdvanceRound: (tournament: Tournament) => void;
  onAddRound: (tournament: Tournament) => void;
  onRefreshMatches: (tournament: Tournament) => void;
  readOnly?: boolean;
}

export default function RoundRobinView({
  tournament,
  players,
  getPlayerName,
  onAddGame,
  onDeleteMatch,
  onDeleteGame,
  onSaveGameEdit,
  onSwapPlayers,
  onAddMarker,
  onAdvanceRound,
  onAddRound,
  onRefreshMatches,
  readOnly = false,
}: RoundRobinViewProps) {
  const allMatches = tournament.matches ?? [];
  const rrMatches  = allMatches.filter(m => m.round === 'roundRobin');

  // Current round = highest bracketRound among round-robin matches
  const currentRound = rrMatches.length > 0
    ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1))
    : 1;

  const currentRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === currentRound);
  const allCurrentComplete  = currentRoundMatches.length > 0 && currentRoundMatches.every(isMatchComplete);
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

  const formatLabel = (round: number) => getRoundRobinFormat(tournament, round) === 'doubles' ? '2v2' : '1v1';

  return (
    <div className="space-y-8">
      <Leaderboard tournament={tournament} players={players} getPlayerName={getPlayerName} />

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="font-display text-xl text-ink">
              {isViewingCurrentRound ? `Round ${currentRound}` : `Round ${selectedRound}`}
              <span className="ml-2 align-middle rounded-full bg-table-soft px-2 py-0.5 text-xs font-semibold text-table" style={{ fontStretch: '100%' }}>
                {formatLabel(selectedRound)}
              </span>
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              {isViewingCurrentRound
                ? `${currentRoundMatches.filter(isMatchComplete).length} of ${currentRoundMatches.length} matches done`
                : 'Past round — results can still be corrected'}
              {!isViewingCurrentRound && (
                <button type="button" onClick={() => setManualRound(null)} className="ml-3 font-semibold text-table hover:underline">
                  Back to round {currentRound} →
                </button>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1" role="group" aria-label="Rounds">
              {Array.from({ length: tournament.roundRobinRounds }, (_, i) => {
                const roundNum = i + 1;
                const roundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === roundNum);
                const complete = roundMatches.length > 0 && roundMatches.every(isMatchComplete);
                const isSelected = roundNum === selectedRound;
                const reachable = roundNum <= currentRound;
                return (
                  <button
                    key={roundNum}
                    type="button"
                    disabled={!reachable}
                    onClick={() => setManualRound(roundNum === currentRound ? null : roundNum)}
                    aria-pressed={isSelected}
                    aria-label={`Round ${roundNum}${complete ? ', complete' : roundNum === currentRound ? ', current' : ''}`}
                    className={`font-digits h-8 min-w-8 rounded-md border px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isSelected
                        ? 'border-table bg-table text-table-ink'
                        : complete
                        ? 'border-line bg-win-soft text-win hover:border-win'
                        : 'border-line bg-surface text-ink-soft hover:border-line-strong'
                    }`}
                  >
                    {roundNum}
                  </button>
                );
              })}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onRefreshMatches(tournament)}
                title="Re-pair any active player who hasn't played the current round yet. Always applies to the current round."
                className="button button-secondary button-sm"
              >
                Refresh pairings
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              onAddMarker={onAddMarker}
              readOnly={readOnly}
            />
          ))}
          {selectedRoundMatches.length === 0 && (
            <p className="col-span-full text-sm text-muted">No matches in this round.</p>
          )}
        </div>
      </section>

      {!readOnly && isViewingCurrentRound && allCurrentComplete && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-win/30 bg-win-soft px-5 py-4">
          <p className="font-semibold text-ink">
            Round {currentRound} is complete.{' '}
            <span className="font-normal text-ink-soft">
              {isLastRound ? 'That was the last planned round.' : `${tournament.roundRobinRounds - currentRound} more planned.`}
            </span>
          </p>
          <button
            type="button"
            onClick={() => (isLastRound ? onAddRound : onAdvanceRound)(tournament)}
            className="button button-accent px-5"
          >
            {isLastRound ? 'Add another round' : `Start round ${currentRound + 1}`}
          </button>
        </div>
      )}
    </div>
  );
}
