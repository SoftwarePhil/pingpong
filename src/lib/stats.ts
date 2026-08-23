import { Player, Game } from '../types/pingpong';
import { getGameSides } from './matchFormat';

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
    const [side1, side2] = getGameSides(game);
    const validSide1Stats = side1
      .map(playerId => statsMap[playerId])
      .filter((playerStats): playerStats is PlayerStats => Boolean(playerStats));
    const validSide2Stats = side2
      .map(playerId => statsMap[playerId])
      .filter((playerStats): playerStats is PlayerStats => Boolean(playerStats));
    if (validSide1Stats.length !== side1.length || validSide2Stats.length !== side2.length) return;

    validSide1Stats.forEach(playerStats => {
      playerStats.gamesPlayed++;
      playerStats.totalPoints += game.score1;
    });
    validSide2Stats.forEach(playerStats => {
      playerStats.gamesPlayed++;
      playerStats.totalPoints += game.score2;
    });

    if (game.score1 > game.score2) {
      validSide1Stats.forEach(playerStats => playerStats.wins++);
      validSide2Stats.forEach(playerStats => playerStats.losses++);
    } else if (game.score2 > game.score1) {
      validSide2Stats.forEach(playerStats => playerStats.wins++);
      validSide1Stats.forEach(playerStats => playerStats.losses++);
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
