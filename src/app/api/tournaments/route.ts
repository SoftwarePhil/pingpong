import { NextRequest, NextResponse } from 'next/server';
import { Tournament, Match } from '../../../types/pingpong';
import fs from 'fs';
import path from 'path';

const tournamentsPath = path.join(process.cwd(), 'src/data/tournaments.json');
const matchesPath = path.join(process.cwd(), 'src/data/matches.json');

export async function GET() {
  try {
    const data = fs.readFileSync(tournamentsPath, 'utf8');
    const tournaments: Tournament[] = JSON.parse(data);
    return NextResponse.json(tournaments);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read tournaments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, roundRobinRounds, bracketRounds, players }: { name: string; roundRobinRounds: number; bracketRounds: { round: number; bestOf: number }[]; players: string[] } = body;
    if (!name || !roundRobinRounds || !bracketRounds || !players || players.length < 2) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    const tournamentsData = fs.readFileSync(tournamentsPath, 'utf8');
    const tournaments: Tournament[] = JSON.parse(tournamentsData);
    const newTournament: Tournament = {
      id: Date.now().toString(),
      name,
      startDate: new Date().toISOString(),
      status: 'roundRobin',
      roundRobinRounds,
      bracketRounds,
      players,
    };
    tournaments.push(newTournament);
    fs.writeFileSync(tournamentsPath, JSON.stringify(tournaments, null, 2));

    // Generate round robin matches
    const matchesData = fs.readFileSync(matchesPath, 'utf8');
    const matches: Match[] = JSON.parse(matchesData);
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const newMatch: Match = {
          id: Date.now().toString() + Math.random(),
          tournamentId: newTournament.id,
          player1Id: players[i],
          player2Id: players[j],
          round: 'roundRobin',
          bestOf: 1, // Round robin is always best of 1
          games: [],
        };
        matches.push(newMatch);
      }
    }
    fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));

    return NextResponse.json(newTournament, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create tournament' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status }: { id: string; status: 'roundRobin' | 'bracket' | 'completed' } = body;
    if (!id || !status) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    const data = fs.readFileSync(tournamentsPath, 'utf8');
    const tournaments: Tournament[] = JSON.parse(data);
    const tournament = tournaments.find(t => t.id === id);
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    tournament.status = status;
    fs.writeFileSync(tournamentsPath, JSON.stringify(tournaments, null, 2));
    return NextResponse.json(tournament);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update tournament' }, { status: 500 });
  }
}
