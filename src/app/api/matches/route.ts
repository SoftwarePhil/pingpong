import { NextRequest, NextResponse } from 'next/server';
import { Match } from '../../../types/pingpong';
import { getMatches, setMatches, saveData, getTournament, setTournament } from '../../../data/data';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournamentId');
    let matches = await getMatches();
    if (tournamentId) {
      matches = matches.filter(m => m.tournamentId === tournamentId);
    }
    return NextResponse.json(matches);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read matches' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tournamentId, player1Id, player2Id, round, bracketRound, bestOf, winnerId }: { tournamentId: string; player1Id: string; player2Id: string; round: 'roundRobin' | 'bracket'; bracketRound?: number; bestOf: number; winnerId?: string } = body;
    if (!tournamentId || !player1Id || !player2Id || !round || !bestOf) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    const matches = await getMatches();
    const newMatch: Match = {
      id: Date.now().toString(),
      tournamentId,
      player1Id,
      player2Id,
      round,
      bracketRound,
      bestOf,
      games: [],
      ...(winnerId && { winnerId }),
    };
    matches.push(newMatch);

    // Also add to tournament's embedded matches
    const tournament = await getTournament(tournamentId);
    if (tournament) {
      if (!tournament.matches) tournament.matches = [];
      tournament.matches.push(newMatch);
      await setTournament(tournament);
    }

    await setMatches(matches);
    await saveData();
    return NextResponse.json(newMatch, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add match' }, { status: 500 });
  }
}
