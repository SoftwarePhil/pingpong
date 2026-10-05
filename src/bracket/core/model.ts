import { BracketMatch, DisplayMatch, MatchSide, PlaceholderMatch } from './types';

/** Opponent slot for a player who advances without playing. */
export const BYE_PLACEHOLDER = 'BYE';

/** Slot whose participant depends on a match that has no winner yet. */
export const TBD_PLACEHOLDER = 'TBD';

/** Slot fed by a play-in match before that match has a winner. */
export const PLAY_IN_WINNER_PLACEHOLDER = 'PLAY_IN_WINNER';

/** Returns true for the legacy single play-in placeholder and indexed placeholders. */
export function isPlayInWinnerPlaceholder(playerId: string): boolean {
  return playerId === PLAY_IN_WINNER_PLACEHOLDER || /^PLAY_IN_WINNER_\d+$/.test(playerId);
}

/** Keeps the original placeholder name for one play-in for legacy data. */
export function getPlayInWinnerPlaceholder(index: number, total: number): string {
  return total === 1
    ? PLAY_IN_WINNER_PLACEHOLDER
    : `${PLAY_IN_WINNER_PLACEHOLDER}_${index + 1}`;
}

/** True for a slot that will be filled by the result of another match. */
export function isPendingSlot(playerId: string): boolean {
  return playerId === TBD_PLACEHOLDER || isPlayInWinnerPlaceholder(playerId);
}

export function hasPendingSlot(match: BracketMatch): boolean {
  return isPendingSlot(match.player1Id) || isPendingSlot(match.player2Id);
}

/** Returns the two sides, falling back to the singles player fields. */
export function getMatchSides(match: BracketMatch): [string[], string[]] {
  if (Array.isArray(match.side1PlayerIds) && Array.isArray(match.side2PlayerIds)) {
    return [[...match.side1PlayerIds], [...match.side2PlayerIds]];
  }
  return [[match.player1Id], [match.player2Id]];
}

/** Finds the winning side for both doubles records and singles records. */
export function getWinningSide(match: BracketMatch): MatchSide | undefined {
  if (match.winnerSide === 1 || match.winnerSide === 2) return match.winnerSide;
  if (!match.winnerId) return undefined;

  const [side1, side2] = getMatchSides(match);
  if (side1.includes(match.winnerId)) return 1;
  if (side2.includes(match.winnerId)) return 2;
  return undefined;
}

export function isMatchComplete(match: BracketMatch): boolean {
  return getWinningSide(match) !== undefined;
}

export function isByeMatch(match: BracketMatch): boolean {
  return getMatchSides(match).flat().includes(BYE_PLACEHOLDER);
}

/** Game wins for each side, in [side 1, side 2] order. */
export function getSeriesScore(match: BracketMatch): [number, number] {
  return [
    match.games.filter(game => game.score1 > game.score2).length,
    match.games.filter(game => game.score2 > game.score1).length,
  ];
}

export function makePlaceholderMatch(bracketRound: number, index: number, kind = 'standard'): PlaceholderMatch {
  return {
    id: `bracket-placeholder-${kind}-r${bracketRound}-${index}`,
    player1Id: TBD_PLACEHOLDER,
    player2Id: TBD_PLACEHOLDER,
    bracketRound,
    bestOf: 1,
    games: [],
    isPlaceholder: true,
  };
}

export function isPlaceholderMatch<M extends BracketMatch>(match: DisplayMatch<M>): match is PlaceholderMatch {
  return 'isPlaceholder' in match && match.isPlaceholder === true;
}
