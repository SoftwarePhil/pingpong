import { Game, MARKER_PLAYER_ID } from '../types/pingpong';

/** Conservative win-rate estimate: small samples stay below well-established records. */
export function wilsonLowerBound(wins: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  return (p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
}

/** How many people played a real game in the last `days` days. Byes and markers don't count. */
export function countActivePlayers(games: Game[], days: number, now = Date.now()): number {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const active = new Set<string>();
  for (const game of games) {
    if (new Date(game.date).getTime() < cutoff) continue;
    const ids = [game.player1Id, game.player2Id, ...(game.side1PlayerIds ?? []), ...(game.side2PlayerIds ?? [])];
    ids.filter(id => id !== MARKER_PLAYER_ID && id !== 'BYE').forEach(id => active.add(id));
  }
  return active.size;
}
