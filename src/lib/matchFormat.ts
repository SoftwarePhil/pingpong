import { Game, Match, RoundRobinFormat, Tournament } from '../types/pingpong';
import { getMatchSides, getWinningSide, isByeMatch, isMatchComplete } from '@/bracket/core';
import type { MatchSide } from '@/bracket/core';

// Side and winner rules are shared with the bracket renderer, which owns them.
export { getMatchSides, getWinningSide, isByeMatch, isMatchComplete };
export type { MatchSide };

const NON_PLAYER_IDS = new Set(['BYE', 'MARKER', 'TBD']);

/** Returns the participant snapshot, falling back to legacy game fields. */
export function getGameSides(game: Game): [string[], string[]] {
  if (Array.isArray(game.side1PlayerIds) && Array.isArray(game.side2PlayerIds)) {
    return [[...game.side1PlayerIds], [...game.side2PlayerIds]];
  }
  return [[game.player1Id], [game.player2Id]];
}

export function isDoublesMatch(match: Match): boolean {
  return match.side1PlayerIds?.length === 2 && match.side2PlayerIds?.length === 2;
}

export function getRoundRobinFormat(tournament: Tournament, round: number): RoundRobinFormat {
  return tournament.roundRobinFormats?.[round] ?? 'singles';
}

export function getWinningPlayerIds(match: Match): string[] {
  const winningSide = getWinningSide(match);
  if (!winningSide) return [];
  return getMatchSides(match)[winningSide - 1];
}

export function getMatchPlayerIds(match: Match): string[] {
  return getMatchSides(match).flat();
}

export function getGamePlayerIds(game: Game): string[] {
  return getGameSides(game).flat();
}

export function getSideForPlayer(matchOrGame: Match | Game, playerId: string): MatchSide | undefined {
  const [side1, side2] = 'round' in matchOrGame
    ? getMatchSides(matchOrGame)
    : getGameSides(matchOrGame);
  if (side1.includes(playerId)) return 1;
  if (side2.includes(playerId)) return 2;
  return undefined;
}

export function isPlayerId(playerId: string | undefined): playerId is string {
  return Boolean(
    playerId &&
    !NON_PLAYER_IDS.has(playerId) &&
    !playerId.startsWith('PLAY_IN_WINNER')
  );
}

export function isValidDoublesRoster(playerIds: string[]): boolean {
  return playerIds.length >= 4 &&
    playerIds.length % 4 === 0 &&
    new Set(playerIds).size === playerIds.length;
}
