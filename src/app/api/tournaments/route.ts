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

    // Generate first round of round robin matches
    const matchesData = fs.readFileSync(matchesPath, 'utf8');
    const matches: Match[] = JSON.parse(matchesData);
    
    // Create balanced pairings for first round
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    const firstRoundMatches = createRoundRobinPairings(shuffledPlayers, newTournament.id, matches, 1);
    
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
    const { id, status, action }: { id: string; status?: 'roundRobin' | 'bracket' | 'completed'; action?: 'advanceRound' } = body;
    
    const data = fs.readFileSync(tournamentsPath, 'utf8');
    const tournaments: Tournament[] = JSON.parse(data);
    const tournament = tournaments.find(t => t.id === id);
    
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    
    const matchesData = fs.readFileSync(matchesPath, 'utf8');
    const matches: Match[] = JSON.parse(matchesData);
    
    if (action === 'advanceRound' && tournament.status === 'roundRobin') {
      // Check if all current round matches are completed
      const currentRoundMatches = matches.filter(m => 
        m.tournamentId === id && 
        m.round === 'roundRobin' && 
        !m.winnerId
      );
      
      if (currentRoundMatches.length > 0) {
        return NextResponse.json({ error: 'Current round is not complete' }, { status: 400 });
      }
      
      // Advance to next round
      const newMatches = advanceRoundRobinRound(id, matches, tournament.players);
      
      if (newMatches.length === 0) {
        // No more matches to create - tournament should move to bracket stage
        tournament.status = 'bracket';
      }
      
      fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
    }
    
    if (status) {
      tournament.status = status;
    }
    
    fs.writeFileSync(tournamentsPath, JSON.stringify(tournaments, null, 2));
    return NextResponse.json(tournament);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update tournament' }, { status: 500 });
  }
}

// Helper function to create a single round of round robin pairings
function createRoundRobinPairings(players: string[], tournamentId: string, matches: Match[], bracketRound: number = 1): Match[] {
  const newMatches: Match[] = [];
  const shuffled = [...players];
  // If odd number of players, add a bye (null)
  if (shuffled.length % 2 === 1) shuffled.push('BYE');
  for (let i = 0; i < shuffled.length; i += 2) {
    if (shuffled[i] !== 'BYE' && shuffled[i + 1] !== 'BYE') {
      const newMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId,
        player1Id: shuffled[i],
        player2Id: shuffled[i + 1],
        round: 'roundRobin',
        bracketRound: bracketRound,
        bestOf: 1,
        games: [],
      };
      newMatches.push(newMatch);
      matches.push(newMatch);
    }
  }
  return newMatches;
}

// Function to advance to next round robin round
function advanceRoundRobinRound(tournamentId: string, matches: Match[], players: string[]): Match[] {
  // Find the next round number
  const tournamentMatches = matches.filter(m => m.tournamentId === tournamentId && m.round === 'roundRobin');
  const existingRounds = tournamentMatches.map(m => m.bracketRound || 1);
  const nextRound = existingRounds.length > 0 ? Math.max(...existingRounds) + 1 : 2;
  // Sort players by performance for pairing (optional, can be random)
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  return createRoundRobinPairings(shuffledPlayers, tournamentId, matches, nextRound);
}
