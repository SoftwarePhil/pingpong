'use client';

import { BracketMatch } from './core/types';
import { getMatchSides, getSeriesScore, getWinningSide } from './core/model';

interface ChampionBannerProps {
  finalMatch: BracketMatch;
  getPlayerName: (id: string) => string;
}

export function ChampionBanner({ finalMatch, getPlayerName }: ChampionBannerProps) {
  const winningSide = getWinningSide(finalMatch);
  if (!winningSide) return null;
  const sides = getMatchSides(finalMatch);
  const champions = sides[winningSide - 1];
  const runnersUp = sides[winningSide === 1 ? 1 : 0];
  const [side1Wins, side2Wins] = getSeriesScore(finalMatch);
  const score = winningSide === 1 ? `${side1Wins}–${side2Wins}` : `${side2Wins}–${side1Wins}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-board px-6 py-5 text-board-ink">
      <div>
        <p className="label-caps text-gold">Champion</p>
        <p className="font-display mt-1 text-3xl">{champions.map(getPlayerName).join(' + ')}</p>
      </div>
      <p className="text-sm text-board-muted">
        Beat {runnersUp.map(getPlayerName).join(' + ')} in the final
        {finalMatch.games.length > 0 && <span className="font-digits ml-2 text-lg text-board-ink">{score}</span>}
      </p>
    </div>
  );
}
