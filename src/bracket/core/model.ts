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

function nextPowerOfTwo(count: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(count, 2))));
}

/** Byes a standard bracket needs for this many players. */
export function getStandardByeCount(playerCount: number): number {
  return nextPowerOfTwo(playerCount) - playerCount;
}

/**
 * Whether byes can be moved to the second round: everyone must be able to
 * pair up in the opening round, and its winners must still need byes.
 */
export function canUseFewerByes(playerCount: number): boolean {
  if (playerCount < 6 || playerCount % 2 === 1) return false;
  return getStandardByeCount(playerCount / 2) > 0;
}

/** Byes needed when everyone plays the opening round first. */
export function getFewerByesCount(playerCount: number): number {
  return getStandardByeCount(playerCount / 2);
}

/**
 * True for a "fewer byes" bracket: its opening round is stored as play-ins, and
 * a play-in winner gets a bye in the next round. No other bracket has both.
 */
export function isFewerByesBracket(matches: BracketMatch[]): boolean {
  const playIns = matches.filter(m => (m.bracketRound ?? 0) === 0 && !m.isThirdPlace);
  if (playIns.length === 0) return false;
  const playInPlayers = new Set(playIns.flatMap(m => [m.player1Id, m.player2Id]));
  return matches.some(m =>
    m.bracketRound === 1 && !m.isThirdPlace && isByeMatch(m) &&
    [m.player1Id, m.player2Id].some(id => isPlayInWinnerPlaceholder(id) || playInPlayers.has(id))
  );
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
