'use client';

import { BracketMatch, BracketPlayer, DisplayMatch, MatchSide } from './core/types';
import {
  BYE_PLACEHOLDER,
  TBD_PLACEHOLDER,
  getMatchSides,
  getSeriesScore,
  getWinningSide,
  isMatchComplete,
  isPendingSlot,
  isPlaceholderMatch,
  isPlayInWinnerPlaceholder,
} from './core/model';
import { BRACKET_GEOMETRY } from './core/layout';

interface BracketCardProps<M extends BracketMatch> {
  match: DisplayMatch<M>;
  getPlayerName: (id: string) => string;
  getPlayer: (id: string) => BracketPlayer | undefined;
  isActive: boolean;
  isFinal?: boolean;
  /** Called when the card is clicked; omit to make the card inert. */
  onSelect?: () => void;
}

function initials(player: BracketPlayer | undefined, fallbackName: string): string {
  const fromProfile = `${player?.firstName?.charAt(0) ?? ''}${player?.lastName?.charAt(0) ?? ''}`;
  return (fromProfile || (player?.name ?? fallbackName).charAt(0)).toUpperCase();
}

function PlayerLabel({ playerId, muted, getPlayerName, getPlayer }: {
  playerId: string;
  muted: boolean;
  getPlayerName: (id: string) => string;
  getPlayer: (id: string) => BracketPlayer | undefined;
}) {
  if (playerId === BYE_PLACEHOLDER) return <>BYE</>;
  if (isPlayInWinnerPlaceholder(playerId)) return <em className="text-gray-400 not-italic text-xs">Play-in winner</em>;
  if (playerId === TBD_PLACEHOLDER) return <em className="text-gray-400 not-italic text-xs">TBD</em>;

  const player = getPlayer(playerId);
  const name = getPlayerName(playerId);
  return (
    <div className="flex items-center gap-2 min-w-0">
      {player?.profilePicture ? (
        // eslint-disable-next-line @next/next/no-img-element -- the bracket is framework-agnostic and cannot depend on next/image
        <img
          src={player.profilePicture}
          alt={`${player.name} profile`}
          className="w-6 h-6 rounded-full object-cover shrink-0 border border-gray-200"
        />
      ) : (
        <span className="w-6 h-6 rounded-full avatar-gradient flex items-center justify-center text-white text-[10px] font-bold shrink-0">
          {initials(player, name)}
        </span>
      )}
      <span className={muted ? 'truncate text-gray-400' : 'truncate'}>{name}</span>
    </div>
  );
}

/** Compact two-row match card: one row per side, with game wins on the right. */
export function BracketCard<M extends BracketMatch>({ match, getPlayerName, getPlayer, isActive, isFinal = false, onSelect }: BracketCardProps<M>) {
  const placeholder = isPlaceholderMatch(match);
  const complete = isMatchComplete(match);
  const winningSide = getWinningSide(match);
  const sides = getMatchSides(match);
  const seriesScore = getSeriesScore(match);

  const border = placeholder
    ? 'border-dashed border-gray-200 bg-gray-50'
    : isFinal && winningSide
    ? 'border-amber-400 shadow-lg shadow-amber-100'
    : isActive
    ? 'border-blue-400 shadow-md shadow-blue-100'
    : 'border-gray-200 hover:border-gray-300';

  const renderSide = (side: MatchSide) => {
    const won = winningSide === side;
    const playerId = sides[side - 1][0];
    const textClass = won
      ? 'text-green-800'
      : complete
      ? 'text-gray-400'
      : side === 2 && (playerId === BYE_PLACEHOLDER || isPendingSlot(playerId))
      ? 'text-gray-400 italic text-xs'
      : 'text-gray-800';
    return (
      <div className={`flex-1 flex items-center pl-3 pr-4 ${side === 1 ? 'border-b border-gray-100' : ''} ${won ? 'bg-green-50' : ''}`}>
        <div className={`text-sm font-semibold flex-1 min-w-0 ${textClass}`}>
          <PlayerLabel playerId={playerId} muted={complete && !won} getPlayerName={getPlayerName} getPlayer={getPlayer} />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {side === 2 && isActive && !complete && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
          {won && <span className="text-amber-500 text-xs leading-none">🏆</span>}
          {match.games.length > 0 && (
            <span className={`text-xs font-black tabular-nums w-4 text-center ${won ? 'text-green-700' : 'text-gray-400'}`}>
              {seriesScore[side - 1]}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{ height: BRACKET_GEOMETRY.cardHeight }}
      className={`relative bg-white border-2 rounded-xl shadow-sm overflow-hidden flex flex-col transition-all select-none ${border} ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={onSelect}
    >
      {renderSide(1)}
      {renderSide(2)}
    </div>
  );
}
