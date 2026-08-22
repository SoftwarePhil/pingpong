import { Match } from '../types/pingpong';

const NON_PLAYER_PAIRING_IDS = new Set(['BYE', 'MARKER', 'TBD']);

function isPairablePlayerId(playerId: string): boolean {
  return Boolean(playerId) && !NON_PLAYER_PAIRING_IDS.has(playerId) && !playerId.startsWith('PLAY_IN_WINNER');
}

function getStandings(players: string[], matches: Match[]): Record<string, { wins: number; pointDiff: number }> {
  const stats: Record<string, { wins: number; pointDiff: number }> = {};
  players.forEach(p => { stats[p] = { wins: 0, pointDiff: 0 }; });
  matches.forEach(m => {
    if (m.winnerId && stats[m.winnerId]) {
      stats[m.winnerId].wins++;
    }
    if (m.player2Id !== 'BYE') {
      m.games.forEach(g => {
        if (stats[g.player1Id]) stats[g.player1Id].pointDiff += g.score1 - g.score2;
        if (stats[g.player2Id]) stats[g.player2Id].pointDiff += g.score2 - g.score1;
      });
    }
  });
  return stats;
}

function rankPlayersByStandings(players: string[], matches: Match[]): string[] {
  const stats = getStandings(players, matches);
  return [...players].sort((a, b) => {
    if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
    return stats[b].pointDiff - stats[a].pointDiff;
  });
}

/** Prior real opponents from RR matches (excludes byes/markers). */
export function getRoundRobinOpponents(matches: Match[]): Map<string, Set<string>> {
  const opponents = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!opponents.has(a)) opponents.set(a, new Set());
    opponents.get(a)!.add(b);
  };
  matches.forEach(m => {
    if (m.round !== 'roundRobin') return;
    if (!isPairablePlayerId(m.player1Id) || !isPairablePlayerId(m.player2Id)) return;
    add(m.player1Id, m.player2Id);
    add(m.player2Id, m.player1Id);
  });
  return opponents;
}

export function getPlayersWithBye(matches: Match[]): Set<string> {
  const byes = new Set<string>();
  matches.forEach(m => {
    if (m.round !== 'roundRobin') return;
    if (m.player2Id === 'BYE' && isPairablePlayerId(m.player1Id)) byes.add(m.player1Id);
    if (m.player1Id === 'BYE' && isPairablePlayerId(m.player2Id)) byes.add(m.player2Id);
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
