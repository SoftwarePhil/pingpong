import { NextResponse } from 'next/server';
import { getPlayers, getAllGames } from '../../../data/data';

interface PlayerStats {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPoints: number;
  avgPointsPerGame: number;
}

export async function GET() {
  try {
    const [players, games] = await Promise.all([getPlayers(), getAllGames()]);

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

    const stats = Object.values(statsMap)
      .map(s => ({
        ...s,
        winRate: s.gamesPlayed > 0 ? Math.round((s.wins / s.gamesPlayed) * 100) : 0,
        avgPointsPerGame: s.gamesPlayed > 0 ? Math.round(s.totalPoints / s.gamesPlayed) : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

    return NextResponse.json({
      stats,
      totalGames: games.length,
      totalPlayers: players.length,
    });
  } catch (error) {
    console.error('Failed to compute stats:', error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
