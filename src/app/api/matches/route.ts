import { NextRequest, NextResponse } from 'next/server';
import { Match } from '../../../types/pingpong';
import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'src/data/matches.json');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournamentId');
    const data = fs.readFileSync(dataPath, 'utf8');
    let matches: Match[] = JSON.parse(data);
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
    const { tournamentId, player1Id, player2Id, round, bracketRound, bestOf }: { tournamentId: string; player1Id: string; player2Id: string; round: 'roundRobin' | 'bracket'; bracketRound?: number; bestOf: number } = body;
    if (!tournamentId || !player1Id || !player2Id || !round || !bestOf) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    const data = fs.readFileSync(dataPath, 'utf8');
    const matches: Match[] = JSON.parse(data);
    const newMatch: Match = {
      id: Date.now().toString(),
      tournamentId,
      player1Id,
      player2Id,
      round,
      bracketRound,
      bestOf,
      games: [],
    };
    matches.push(newMatch);
    fs.writeFileSync(dataPath, JSON.stringify(matches, null, 2));
    return NextResponse.json(newMatch, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add match' }, { status: 500 });
  }
}
