'use client';

import { BracketMatch } from './core/types';
import { getMatchSides, getWinningSide } from './core/model';

interface ChampionBannerProps {
  finalMatch: BracketMatch;
  getPlayerName: (id: string) => string;
}

export function ChampionBanner({ finalMatch, getPlayerName }: ChampionBannerProps) {
  const winningSide = getWinningSide(finalMatch);
  if (!winningSide) return null;
  const champions = getMatchSides(finalMatch)[winningSide - 1];

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-50 border-2 border-amber-200 rounded-2xl py-5">
      <span className="text-4xl">🏆</span>
      <div>
        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">Tournament Champion</p>
        <p className="text-2xl font-black text-amber-900">{champions.map(getPlayerName).join(' + ')}</p>
      </div>
    </div>
  );
}
