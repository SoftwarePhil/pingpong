import { Match } from '../types/pingpong';
import { getMatchSides, isByeMatch } from './matchFormat';
import { getRoundRobinStandings } from './standings';

const NON_PLAYER_PAIRING_IDS = new Set(['BYE', 'MARKER', 'TBD']);

function isPairablePlayerId(playerId: string): boolean {
  return Boolean(playerId) && !NON_PLAYER_PAIRING_IDS.has(playerId) && !playerId.startsWith('PLAY_IN_WINNER');
}

function getStandings(players: string[], matches: Match[]): Record<string, { wins: number; pointDiff: number }> {
  const standings = getRoundRobinStandings(players, matches);
  return Object.fromEntries(players.map(playerId => [playerId, {
    wins: standings[playerId].wins,
    pointDiff: standings[playerId].pointDiff,
  }]));
}

function rankPlayersByStandings(players: string[], matches: Match[]): string[] {
  const stats = getStandings(players, matches);
  return [...players].sort((a, b) => {
    if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
    return stats[b].pointDiff - stats[a].pointDiff;
  });
}

/** Prior scheduled opponents from RR matches (excludes byes/markers). */
export function getRoundRobinOpponents(matches: Match[]): Map<string, Set<string>> {
  const opponents = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!opponents.has(a)) opponents.set(a, new Set());
    opponents.get(a)!.add(b);
  };
  matches.forEach(m => {
    if (m.round !== 'roundRobin') return;
    const [side1, side2] = getMatchSides(m);
    const players1 = side1.filter(isPairablePlayerId);
    const players2 = side2.filter(isPairablePlayerId);
    if (players1.length === 0 || players2.length === 0 || isByeMatch(m)) return;
    players1.forEach(player1 => players2.forEach(player2 => {
      add(player1, player2);
      add(player2, player1);
    }));
  });
  return opponents;
}

export function getPlayersWithBye(matches: Match[]): Set<string> {
  const byes = new Set<string>();
  matches.forEach(m => {
    if (m.round !== 'roundRobin') return;
    const [side1, side2] = getMatchSides(m);
    if (side1.includes('BYE')) side2.filter(isPairablePlayerId).forEach(playerId => byes.add(playerId));
    if (side2.includes('BYE')) side1.filter(isPairablePlayerId).forEach(playerId => byes.add(playerId));
  });
  return byes;
}

function pickByePlayer(ranked: string[], previousByes: Set<string>): string {
  for (let i = ranked.length - 1; i >= 0; i--) {
    if (!previousByes.has(ranked[i])) return ranked[i];
  }
  return ranked[ranked.length - 1];
}

/**
 * Greedy backtracking pairing: try non-rematches and closer score groups first.
 * Always returns a complete pairing for an even-sized list.
 */
function swissPairRemaining(
  remaining: string[],
  wins: Record<string, number>,
  opponents: Map<string, Set<string>>,
): [string, string][] | null {
  if (remaining.length === 0) return [];
  const player = remaining[0];
  const rest = remaining.slice(1);
  const prior = opponents.get(player) ?? new Set();
  const options = rest
    .map((candidate, index) => ({
      candidate,
      index,
      rematch: prior.has(candidate),
      winDiff: Math.abs((wins[player] ?? 0) - (wins[candidate] ?? 0)),
    }))
    .sort((a, b) => {
      if (a.rematch !== b.rematch) return a.rematch ? 1 : -1;
      if (a.winDiff !== b.winDiff) return a.winDiff - b.winDiff;
      return a.index - b.index;
    });

  for (const option of options) {
    const nested = swissPairRemaining(
      rest.filter(id => id !== option.candidate),
      wins,
      opponents,
    );
    if (nested) return [[player, option.candidate], ...nested];
  }
  return null;
}

/**
 * Orders players for `createRoundRobinPairings`: adjacent pairs are matches,
 * and an odd leftover is placed last so they receive the bye.
 */
export function orderPlayersForSwissPairing(players: string[], matches: Match[]): string[] {
  if (players.length <= 1) return [...players];

  const ranked = rankPlayersByStandings(players, matches);
  const stats = getStandings(players, matches);
  const wins: Record<string, number> = {};
  players.forEach(p => { wins[p] = stats[p].wins; });
  const opponents = getRoundRobinOpponents(matches);
  const previousByes = getPlayersWithBye(matches);

  let pool = [...ranked];
  let byePlayer: string | null = null;
  if (pool.length % 2 === 1) {
    byePlayer = pickByePlayer(pool, previousByes);
    pool = pool.filter(p => p !== byePlayer);
  }

  const pairs = swissPairRemaining(pool, wins, opponents);
  const ordered = pairs ? pairs.flat() : pool;
  if (byePlayer) ordered.push(byePlayer);
  return ordered;
}
