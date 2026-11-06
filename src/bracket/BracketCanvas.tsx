'use client';

import { BracketMatch, BracketPlayer, DisplayMatch } from './core/types';
import { BRACKET_GEOMETRY, BracketLayout, getBracketCardZIndex } from './core/layout';
import { BracketCard } from './BracketCard';

const { cardWidth, columnGap } = BRACKET_GEOMETRY;

interface BracketCanvasProps<M extends BracketMatch> {
  layout: BracketLayout<M>;
  activeMatchId: string | null;
  getPlayerName: (id: string) => string;
  getPlayer: (id: string) => BracketPlayer | undefined;
  /** Returns the click handler for a card, or undefined when the card cannot be opened. */
  getSelectHandler: (match: DisplayMatch<M>) => (() => void) | undefined;
}

/** Draws round labels, connector lines, every match card and the third-place card. */
export function BracketCanvas<M extends BracketMatch>({ layout, activeMatchId, getPlayerName, getPlayer, getSelectHandler }: BracketCanvasProps<M>) {
  const { width, height, playInCards, playInLabel, playInWinnerLabel, byeMarkers, rounds, connectors, thirdPlace } = layout;
  const hasPlayIn = playInCards.length > 0;

  const card = (match: DisplayMatch<M>, isFinal = false) => (
    <BracketCard
      match={match}
      getPlayerName={getPlayerName}
      getPlayer={getPlayer}
      isActive={activeMatchId === match.id}
      isFinal={isFinal}
      playInWinnerLabel={playInWinnerLabel}
      onSelect={getSelectHandler(match)}
    />
  );

  return (
    <>
      <div className="flex">
        {hasPlayIn && (
          <div style={{ width: cardWidth + columnGap, flexShrink: 0 }}>
            <p className="text-center text-xs font-bold text-muted uppercase tracking-widest">{playInLabel}</p>
          </div>
        )}
        {rounds.map(round => (
          <div key={round.roundNumber} style={{ width: cardWidth + columnGap, flexShrink: 0 }}>
            <p className={`text-center text-xs font-bold uppercase tracking-widest ${round.isChampionship ? 'text-gold' : 'text-muted'}`}>
              {round.label}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div style={{ position: 'relative', width, height, isolation: 'isolate' }}>
          <svg
            style={{ position: 'absolute', inset: 0, width, height, overflow: 'visible', zIndex: 0 }}
            className="pointer-events-none text-line-strong"
            aria-hidden
          >
            {connectors.map(({ d, key, dashed }) => (
              <path
                key={key}
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray={dashed ? '6 6' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {playInCards.map(({ match, y }) => (
            <div
              key={match.id}
              style={{
                position: 'absolute',
                left: 0,
                top: y,
                width: cardWidth,
                zIndex: getBracketCardZIndex('playIn', activeMatchId === match.id),
              }}
            >
              {card(match)}
            </div>
          ))}

          {byeMarkers.map(({ key, x, y }) => (
            <span
              key={key}
              style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)' }}
              className="label-caps rounded-full border border-line bg-surface px-2 py-0.5 text-muted"
            >
              Bye
            </span>
          ))}

          {rounds.flatMap(round => round.cards.map(({ match, x, y }) => (
            <div
              key={match.id}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: cardWidth,
                zIndex: getBracketCardZIndex('main', activeMatchId === match.id),
              }}
            >
              {card(match, round.isFinalRound)}
            </div>
          )))}
        </div>
      </div>

      {/* The placement match is separate from the elimination tree, so it sits
          under the final without connectors. */}
      {thirdPlace && (
        <div className="overflow-x-auto pt-2">
          <div style={{ width }}>
            <div style={{ marginLeft: thirdPlace.x, width: cardWidth }}>
              <p className="text-center text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Third place</p>
              {card(thirdPlace.match)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
