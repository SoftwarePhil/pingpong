import { NextResponse } from 'next/server';
import { getPlayers, getAllGames } from '../../../data/data';
import { computeStats } from '../../../lib/stats';

export async function GET() {
  try {
    const [players, games] = await Promise.all([getPlayers(), getAllGames()]);
    const stats = computeStats(players, games);

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
