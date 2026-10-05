import { BracketMatch, DisplayMatch } from './types';
import {
  BYE_PLACEHOLDER,
  getPlayInWinnerPlaceholder,
  isMatchComplete,
  makePlaceholderMatch,
} from './model';

/** Fixed card geometry. Cards have a fixed height so connector lines stay aligned. */
export const BRACKET_GEOMETRY = {
  cardWidth: 240,
  cardHeight: 76,
  /** Vertical gap between cards in the first main round. */
  rowGap: 32,
  /** Horizontal gap between round columns. */
  columnGap: 80,
} as const;

const { cardWidth, cardHeight, rowGap, columnGap } = BRACKET_GEOMETRY;
const rowUnit = cardHeight + rowGap;
const columnUnit = cardWidth + columnGap;

export type BracketCardLayer = 'main' | 'playIn';

export interface BracketConnector {
  key: string;
  /** SVG path data. */
  d: string;
  dashed?: boolean;
}

export interface PositionedMatch<M extends BracketMatch> {
  match: DisplayMatch<M>;
  x: number;
  y: number;
}

export interface BracketRoundColumn<M extends BracketMatch> {
  roundNumber: number;
  label: string;
  /** True when the column holds a single match, which is styled as the championship. */
  isChampionship: boolean;
  isFinalRound: boolean;
  cards: PositionedMatch<M>[];
}

export interface BracketLayout<M extends BracketMatch> {
  width: number;
  height: number;
  /** Play-in matches in display order, top to bottom, aligned with the slots they feed. */
  playInMatches: M[];
  rounds: BracketRoundColumn<M>[];
  connectors: BracketConnector[];
  /** The third-place card, placed under the final, or null when it is not shown. */
  thirdPlace: { match: DisplayMatch<M>; x: number } | null;
  /** The completed final, once the bracket has a champion. */
  championMatch: M | null;
}

export interface BracketLayoutOptions {
  /** Draw a third-place slot, including before the placement match exists. */
  showThirdPlace?: boolean;
}

export function getBracketSlotOffset(isTopSlot: boolean): number {
  return isTopSlot ? 1 / 4 : 3 / 4;
}

export function orderPlayInIndexesByTarget(
  playInCount: number,
  targetIndexes: number[],
): number[] {
  return Array.from({ length: playInCount }, (_, index) => index)
    .sort((a, b) => (targetIndexes[a] ?? Number.MAX_SAFE_INTEGER) - (targetIndexes[b] ?? Number.MAX_SAFE_INTEGER) || a - b);
}

export function getPlayInTargetIndex(
  matches: Array<{ player1Id: string; player2Id: string }>,
  placeholder: string,
  participantIds: string[],
  winnerId?: string,
): number {
  return matches.findIndex(match => {
    const slots = [match.player1Id, match.player2Id];
    return slots.some(id => id === placeholder || id === winnerId || participantIds.includes(id));
  });
}

export function shouldUseStraightPlayInConnector(sourceY: number, targetY: number): boolean {
  return Math.abs(sourceY - targetY) <= 8;
}

/** Keeps play-in cards above the main bracket when their geometry overlaps. */
export function getBracketCardZIndex(layer: BracketCardLayer, active = false): number {
  if (active) return 4;
  return layer === 'playIn' ? 3 : 1;
}

export function getRoundLabel(roundNumber: number, matchCount: number): string {
  if (matchCount === 1) return '🏆 Final';
  if (matchCount === 2) return 'Semifinal';
  if (matchCount === 4) return 'Quarterfinal';
  return `Round ${roundNumber}`;
}

/** Top-left corner of match `matchIndex` in main-bracket column `roundIndex`. */
function getCardPosition(roundIndex: number, matchIndex: number, hasPlayIn: boolean) {
  const groupSize = Math.pow(2, roundIndex);
  const y = matchIndex * groupSize * rowUnit + (groupSize * rowUnit - cardHeight) / 2;
  const x = (hasPlayIn ? columnUnit : 0) + roundIndex * columnUnit;
  return { x, y };
}

/** True when the R1 match's top slot is the one a play-in feeds. */
function isPlayInTopSlot(target: BracketMatch, playIn: BracketMatch, placeholder: string): boolean {
  return target.player1Id === placeholder ||
    target.player1Id === playIn.winnerId ||
    [playIn.player1Id, playIn.player2Id].includes(target.player1Id);
}

/**
 * Computes the full drawing of a bracket: card positions, column labels,
 * connector paths and canvas size. Rounds that the API has not created yet are
 * filled with placeholder cards so the complete structure is always visible.
 * Returns null when there is nothing to draw.
 */
export function computeBracketLayout<M extends BracketMatch>(
  bracketMatches: M[],
  { showThirdPlace = false }: BracketLayoutOptions = {},
): BracketLayout<M> | null {
  const playIns = bracketMatches.filter(m => (m.bracketRound ?? 0) === 0);
  const mainMatches = bracketMatches.filter(m => (m.bracketRound ?? 0) > 0 && !m.isThirdPlace);
  const thirdPlaceMatch = bracketMatches.find(m => m.isThirdPlace);
  const hasPlayIn = playIns.length > 0;

  if (mainMatches.length === 0 && !hasPlayIn) return null;

  // ── Round structure ─────────────────────────────────────────────────────
  const roundNumbers = mainMatches.map(m => m.bracketRound ?? 1);
  const firstRound = roundNumbers.length > 0 ? Math.min(...roundNumbers) : 1;
  const lastActualRound = roundNumbers.length > 0 ? Math.max(...roundNumbers) : firstRound;
  const actualFirstRoundMatches = mainMatches.filter(m => (m.bracketRound ?? 1) === firstRound);

  const r1Count = Math.max(
    actualFirstRoundMatches.length,
    roundNumbers.length > 0 ? Math.pow(2, lastActualRound - firstRound) : 1,
    1,
  );
  const roundCount = Math.max(
    Math.ceil(Math.log2(r1Count)) + 1,
    roundNumbers.length > 0 ? lastActualRound - firstRound + 1 : 1,
  );
  const roundMatches: DisplayMatch<M>[][] = Array.from({ length: roundCount }, (_, roundIndex) => {
    const roundNumber = firstRound + roundIndex;
    const actual = mainMatches.filter(m => (m.bracketRound ?? 1) === roundNumber);
    const expectedCount = Math.max(1, Math.ceil(r1Count / Math.pow(2, roundIndex)));
    return Array.from({ length: expectedCount }, (_, matchIndex) =>
      actual[matchIndex] ?? makePlaceholderMatch(roundNumber, matchIndex)
    );
  });
  const firstRoundCards = roundMatches[0];
  const finalRoundIndex = roundCount - 1;

  // ── Play-in column ──────────────────────────────────────────────────────
  // Each play-in feeds one specific R1 slot; encode it as matchIndex * 2 + slot.
  const playInPlaceholders = playIns.map((_, index) => getPlayInWinnerPlaceholder(index, playIns.length));
  const playInTargets = playIns.map((playIn, index) => {
    const targetIndex = getPlayInTargetIndex(
      firstRoundCards,
      playInPlaceholders[index],
      [playIn.player1Id, playIn.player2Id],
      playIn.winnerId,
    );
    if (targetIndex === -1) return -1;
    return targetIndex * 2 + (isPlayInTopSlot(firstRoundCards[targetIndex], playIn, playInPlaceholders[index]) ? 0 : 1);
  });
  const playInOrder = orderPlayInIndexesByTarget(playIns.length, playInTargets);

  // ── Connectors ──────────────────────────────────────────────────────────
  const connectors: BracketConnector[] = [];

  playIns.forEach((playIn, index) => {
    const target = playInTargets[index];
    if (target === -1) return;
    const targetMatchIndex = Math.floor(target / 2);
    const targetPos = getCardPosition(0, targetMatchIndex, hasPlayIn);
    const sourceY = playInOrder.indexOf(index) * rowUnit + cardHeight / 2;
    // A play-in winner occupies one specific player row, not the center of
    // the whole card, so multiple play-ins feeding one match stay distinct.
    const isTopSlot = isPlayInTopSlot(firstRoundCards[targetMatchIndex], playIn, playInPlaceholders[index]);
    const targetY = targetPos.y + cardHeight * getBracketSlotOffset(isTopSlot);
    const bridgeX = cardWidth + columnGap / 2;
    connectors.push({
      key: `playin-${index}`,
      d: shouldUseStraightPlayInConnector(sourceY, targetY)
        ? `M ${cardWidth} ${sourceY} H ${targetPos.x}`
        : `M ${cardWidth} ${sourceY} H ${bridgeX} V ${targetY} H ${targetPos.x}`,
      dashed: true,
    });
  });

  // Each pair of matches in a round feeds one match in the next: a ┤ shape.
  for (let roundIndex = 0; roundIndex < finalRoundIndex; roundIndex++) {
    const pairCount = Math.floor(roundMatches[roundIndex].length / 2);
    for (let pair = 0; pair < pairCount; pair++) {
      const top = getCardPosition(roundIndex, pair * 2, hasPlayIn);
      const bottom = getCardPosition(roundIndex, pair * 2 + 1, hasPlayIn);
      const next = getCardPosition(roundIndex + 1, pair, hasPlayIn);
      const x1 = top.x + cardWidth;
      const y1 = top.y + cardHeight / 2;
      const x2 = bottom.x + cardWidth;
      const y2 = bottom.y + cardHeight / 2;
      const midX = x1 + columnGap / 2;
      const midY = (y1 + y2) / 2;
      connectors.push({
        key: `r${roundIndex}-${pair}`,
        d: [
          `M ${x1} ${y1} H ${midX}`,
          `M ${x2} ${y2} H ${midX}`,
          `M ${midX} ${y1} V ${y2}`,
          `M ${midX} ${midY} H ${next.x}`,
        ].join(' '),
      });
    }
  }

  // ── Columns ─────────────────────────────────────────────────────────────
  const rounds = roundMatches.map((matches, roundIndex): BracketRoundColumn<M> => {
    const roundNumber = firstRound + roundIndex;
    return {
      roundNumber,
      label: hasPlayIn && roundIndex === 0 && matches.length === 4
        ? 'Main R1 (no byes)'
        : getRoundLabel(roundNumber, matches.length),
      isChampionship: matches.length === 1,
      isFinalRound: roundIndex === finalRoundIndex,
      cards: matches.map((match, matchIndex) => ({ match, ...getCardPosition(roundIndex, matchIndex, hasPlayIn) })),
    };
  });

  // ── Third place and champion ────────────────────────────────────────────
  const bracketPlayerIds = new Set(
    mainMatches.flatMap(m => [m.player1Id, m.player2Id]).filter(id => id !== BYE_PLACEHOLDER)
  );
  const canHaveSemifinals = actualFirstRoundMatches.length >= 4 || (
    actualFirstRoundMatches.length === 2 &&
    actualFirstRoundMatches.every(m => m.player1Id !== BYE_PLACEHOLDER && m.player2Id !== BYE_PLACEHOLDER)
  );
  const showThirdPlaceSlot = showThirdPlace && (
    Boolean(thirdPlaceMatch) || (bracketPlayerIds.size >= 4 && canHaveSemifinals)
  );
  const finalRoundNumber = firstRound + finalRoundIndex;
  const finalRoundActual = mainMatches.filter(m => m.bracketRound === finalRoundNumber);

  return {
    width: (hasPlayIn ? columnUnit : 0) + roundCount * columnUnit - columnGap + 2,
    // Play-ins use their own column, which can be taller than the main bracket.
    height: Math.max(r1Count, playIns.length) * rowUnit,
    playInMatches: playInOrder.map(index => playIns[index]),
    rounds,
    connectors,
    thirdPlace: showThirdPlaceSlot
      ? {
          match: thirdPlaceMatch ?? makePlaceholderMatch(finalRoundNumber, 0, 'third-place'),
          x: getCardPosition(finalRoundIndex, 0, hasPlayIn).x,
        }
      : null,
    championMatch: finalRoundActual.length === 1 && isMatchComplete(finalRoundActual[0])
      ? finalRoundActual[0]
      : null,
  };
}
