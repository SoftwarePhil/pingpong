import { Player, Game } from '../types/pingpong';

export interface PlayerStats {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPoints: number;
  avgPointsPerGame: number;
  rankingScore: number;
}

/** Conservative win-rate estimate: small samples stay below well-established records. */
export function wilsonLowerBound(wins: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  return (p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
}

export function computeStats(players: Player[], games: Game[]): PlayerStats[] {
  const statsMap: Record<string, PlayerStats> = {};
  players.forEach(p => {
    statsMap[p.id] = {
      id: p.id,
      name: p.name,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPoints: 0,
      avgPointsPerGame: 0,
      rankingScore: 0,
    };
  });

  // Aggregate game results — BYE or unknown players are skipped
  games.forEach(game => {
    const p1 = statsMap[game.player1Id];
    const p2 = statsMap[game.player2Id];
    if (!p1 || !p2) return;

    p1.gamesPlayed++;
    p2.gamesPlayed++;
    p1.totalPoints += game.score1;
    p2.totalPoints += game.score2;

    if (game.score1 > game.score2) {
      p1.wins++;
      p2.losses++;
    } else if (game.score2 > game.score1) {
      p2.wins++;
      p1.losses++;
    }
  });

  return Object.values(statsMap)
    .map(s => ({
      ...s,
      winRate: s.gamesPlayed > 0 ? Math.round((s.wins / s.gamesPlayed) * 100) : 0,
      avgPointsPerGame: s.gamesPlayed > 0 ? Math.round(s.totalPoints / s.gamesPlayed) : 0,
      rankingScore: wilsonLowerBound(s.wins, s.gamesPlayed),
    }))
    .sort((a, b) => b.rankingScore - a.rankingScore || b.gamesPlayed - a.gamesPlayed);
}
