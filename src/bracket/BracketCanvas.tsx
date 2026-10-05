'use client';

import { BracketMatch, BracketPlayer, DisplayMatch } from './core/types';
import { BRACKET_GEOMETRY, BracketLayout, getBracketCardZIndex } from './core/layout';
import { BracketCard } from './BracketCard';

const { cardWidth, cardHeight, rowGap, columnGap } = BRACKET_GEOMETRY;
const CONNECTOR_COLOR = '#CBD5E1';

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
  const { width, height, playInMatches, rounds, connectors, thirdPlace } = layout;
  const hasPlayIn = playInMatches.length > 0;

  const card = (match: DisplayMatch<M>, isFinal = false) => (
    <BracketCard
      match={match}
      getPlayerName={getPlayerName}
      getPlayer={getPlayer}
      isActive={activeMatchId === match.id}
      isFinal={isFinal}
      onSelect={getSelectHandler(match)}
    />
  );

  return (
    <>
      <div className="flex">
        {hasPlayIn && (
          <div style={{ width: cardWidth + columnGap, flexShrink: 0 }}>
            <p className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Play-in (prelim)</p>
          </div>
        )}
        {rounds.map(round => (
          <div key={round.roundNumber} style={{ width: cardWidth + columnGap, flexShrink: 0 }}>
            <p className={`text-center text-xs font-bold uppercase tracking-widest ${round.isChampionship ? 'text-amber-600' : 'text-gray-400'}`}>
              {round.label}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div style={{ position: 'relative', width, height, isolation: 'isolate' }}>
          <svg
            style={{ position: 'absolute', inset: 0, width, height, overflow: 'visible', zIndex: 0 }}
            className="pointer-events-none"
            aria-hidden
          >
            {connectors.map(({ d, key, dashed }) => (
              <path
                key={key}
                d={d}
                fill="none"
                stroke={CONNECTOR_COLOR}
                strokeWidth={2}
                strokeDasharray={dashed ? '6 6' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {/* Play-ins sit in their own flow column so they never overlap the
              absolutely positioned main bracket when the counts differ. */}
          {hasPlayIn && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: cardWidth,
                height,
                zIndex: getBracketCardZIndex('playIn'),
                display: 'flex',
                flexDirection: 'column',
                gap: rowGap,
              }}
            >
              {playInMatches.map(match => (
                <div key={match.id} style={{ width: cardWidth, flex: `0 0 ${cardHeight}px` }}>
                  {card(match)}
                </div>
              ))}
            </div>
          )}

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
              <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Third place</p>
              {card(thirdPlace.match)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
