import { NextRequest, NextResponse } from 'next/server';
import { getAllMatches, getMatchesForTournament } from '../../../data/data';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournamentId');
    const matches = tournamentId
      ? await getMatchesForTournament(tournamentId)
      : await getAllMatches();
    return NextResponse.json(matches);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read matches' }, { status: 500 });
  }
}
