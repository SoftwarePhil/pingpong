'use client';

import { Match } from '../../../types/pingpong';
import { getMatchPlayerIds, getMatchSides, getWinningSide } from '../../../lib/matchFormat';

interface PastRoundsSummaryProps {
  roundRobinMatches: Match[];
  getPlayerName: (id: string) => string;
}

/** Read-only round robin results, shown once the bracket has frozen them. */
export function PastRoundsSummary({ roundRobinMatches, getPlayerName }: PastRoundsSummaryProps) {
  const rounds = [...new Set(roundRobinMatches.map(m => m.bracketRound ?? 1))].sort((a, b) => a - b);

  return (
    <section className="space-y-5">
      <h3 className="label-caps text-muted">Round robin results</h3>
      {rounds.map(round => {
        const matches = roundRobinMatches.filter(m =>
          (m.bracketRound ?? 1) === round && !getMatchPlayerIds(m).includes('BYE')
        );
        return (
          <div key={round}>
            <p className="mb-2 text-sm font-semibold text-ink">Round {round}</p>
            {matches.length === 0 ? (
              <p className="text-sm text-muted">No head-to-head matches in this round.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {matches.map(match => {
                  const [side1, side2] = getMatchSides(match);
                  const winningSide = getWinningSide(match);
                  return (
                    <li key={match.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className={`flex-1 truncate ${winningSide === 1 ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                        {side1.map(getPlayerName).join(' + ')}
                      </span>
                      <span className="font-digits shrink-0 text-ink">
                        {match.games.length === 0
                          ? <span className="text-muted">—</span>
                          : match.games.map(g => `${g.score1}–${g.score2}`).join('  ·  ')}
                      </span>
                      <span className={`flex-1 truncate text-right ${winningSide === 2 ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                        {side2.map(getPlayerName).join(' + ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
