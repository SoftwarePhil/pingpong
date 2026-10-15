'use client';

import { BracketMatch } from './core/types';
import { getSeriesScore } from './core/model';

interface MatchResultProps {
  match: BracketMatch;
  getPlayerName: (id: string) => string;
  onClose: () => void;
}

const firstName = (name: string) => name.split(' ')[0];

/** Read-only game-by-game result of a finished match. */
export function MatchResult({ match, getPlayerName, onClose }: MatchResultProps) {
  const player1 = getPlayerName(match.player1Id);
  const player2 = getPlayerName(match.player2Id);
  const [side1Wins, side2Wins] = getSeriesScore(match);

  return (
    <div className="max-w-2xl rounded-xl border border-line bg-surface p-5">
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5">Match result</p>
          <h4 className="font-bold text-ink text-base">
            <span className={match.winnerId === match.player1Id ? 'text-win' : 'text-muted'}>{player1}</span>
            <span className="text-line-strong mx-2">vs</span>
            <span className={match.winnerId === match.player2Id ? 'text-win' : 'text-muted'}>{player2}</span>
          </h4>
        </div>
        <button onClick={onClose} className="text-line-strong hover:text-ink-soft text-xl font-bold leading-none">✕</button>
      </div>
      <div className="space-y-2">
        {match.games.map((game, index) => {
          const side1Won = game.score1 > game.score2;
          return (
            <div key={game.id} className="flex items-center justify-between bg-surface-sunken rounded-xl px-4 py-2.5">
              <span className="text-xs font-semibold text-muted w-10">G{index + 1}</span>
              <div className="flex items-center gap-3 flex-1 justify-center">
                <span className={`text-sm font-semibold w-24 text-right ${side1Won ? 'text-win' : 'text-muted'}`}>{player1}</span>
                <span className="font-black text-ink tabular-nums text-base">{game.score1} – {game.score2}</span>
                <span className={`text-sm font-semibold w-24 text-left ${!side1Won ? 'text-win' : 'text-muted'}`}>{player2}</span>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border w-20 text-center ${
                side1Won ? 'bg-win-soft border-win/30 text-win' : 'bg-loss-soft border-loss/30 text-loss'
              }`}>
                {firstName(side1Won ? player1 : player2)}
              </span>
            </div>
          );
        })}
      </div>
      {match.winnerId && (
        <p className="mt-3 text-xs text-muted text-center">
          {side1Wins}–{side2Wins} series · {getPlayerName(match.winnerId)} wins
        </p>
      )}
    </div>
  );
}
