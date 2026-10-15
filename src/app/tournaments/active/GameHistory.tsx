'use client';

import { Match } from '../../../types/pingpong';
import { getGameSides } from '../../../lib/matchFormat';

interface GameHistoryProps {
  matches: Match[];
  getPlayerName: (id: string) => string;
}

function roundLabel(match: Match): string {
  if (match.round !== 'bracket') return `Round robin · R${match.bracketRound ?? 1}`;
  if (match.isThirdPlace) return 'Third place';
  if (match.bracketRound === 0) return 'Play-in';
  return `Bracket · R${match.bracketRound ?? 1}`;
}

/** Every game recorded in this tournament, newest first. */
export function GameHistory({ matches, getPlayerName }: GameHistoryProps) {
  const games = matches
    .flatMap(match => match.games.map(game => ({ game, match })))
    .sort((a, b) => b.game.date.localeCompare(a.game.date));

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <h3 className="label-caps text-muted">Game history</h3>
        <span className="font-digits text-sm text-muted">{games.length}</span>
      </div>
      {games.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-soft">No games recorded yet.</p>
      ) : (
        <ol className="max-h-80 divide-y divide-line overflow-y-auto">
          {games.map(({ game, match }) => {
            const [side1, side2] = getGameSides(game);
            const side1Won = game.score1 > game.score2;
            return (
              <li key={game.id} className="flex items-center gap-4 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className={side1Won ? 'font-semibold text-ink' : 'text-ink-soft'}>{side1.map(getPlayerName).join(' + ')}</span>
                    <span className="mx-1.5 text-muted">vs</span>
                    <span className={!side1Won ? 'font-semibold text-ink' : 'text-ink-soft'}>{side2.map(getPlayerName).join(' + ')}</span>
                  </p>
                  <p className="text-xs text-muted">{roundLabel(match)} · {new Date(game.date).toLocaleString()}</p>
                </div>
                <span className="font-digits text-lg text-ink">{game.score1}–{game.score2}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
