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
    createRoundRobinPairings(shuffledPlayers, newTournament.id, matches, 1);
    
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
    
if (action === 'advanceRound') {
      if (tournament.status === 'roundRobin') {
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
        const newMatches = advanceRoundRobinRound(tournament, matches);

        if (newMatches.length === 0) {
          // No more matches to create - tournament should move to bracket stage
          tournament.status = 'bracket';
          // Create bracket matches
          createBracketMatches(tournament, matches);
        }

        fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
      } else if (tournament.status === 'bracket') {
        // Advance bracket round
        const advanced = advanceBracketRound(tournament, matches);
        if (!advanced) {
          return NextResponse.json({ error: 'Cannot advance bracket round' }, { status: 400 });
        }
        fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
      }
    }
    
    if (status) {
      const oldStatus = tournament.status;
      tournament.status = status;
      // If changing to bracket status or already bracket but no matches, create bracket matches
      if (status === 'bracket' && (oldStatus !== 'bracket' || !matches.some(m => m.tournamentId === tournament.id && m.round === 'bracket'))) {
        createBracketMatches(tournament, matches);
        fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
      }
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

// Function to advance bracket round
function advanceBracketRound(tournament: Tournament, matches: Match[]): boolean {
  // Find current bracket round
  const bracketMatches = matches.filter(m => m.tournamentId === tournament.id && m.round === 'bracket');
  if (bracketMatches.length === 0) {
    return false; // No bracket matches exist
  }

  const currentRound = Math.max(...bracketMatches.map(m => m.bracketRound || 1));
  const currentRoundMatches = bracketMatches.filter(m => (m.bracketRound || 1) === currentRound);

  // Check if all current round matches are completed
  const incompleteMatches = currentRoundMatches.filter(m => !m.winnerId);
  if (incompleteMatches.length > 0) {
    return false; // Current round not complete
  }

  // Get winners
  const winners = currentRoundMatches.map(m => m.winnerId).filter(id => id) as string[];

  // Find next bracket round config
  const nextBracketRoundConfig = tournament.bracketRounds.find(br => br.round === currentRound + 1);
  if (!nextBracketRoundConfig || winners.length < 2) {
    // No more bracket rounds or not enough winners
    tournament.status = 'completed';
    return true;
  }

  // Create next round matches
  for (let i = 0; i < winners.length; i += 2) {
    if (i + 1 < winners.length) {
      const newMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: winners[i],
        player2Id: winners[i + 1],
        round: 'bracket',
        bracketRound: nextBracketRoundConfig.round,
        bestOf: nextBracketRoundConfig.bestOf,
        games: [],
      };
      matches.push(newMatch);
    }
  }

  return true;
}

// Function to create bracket matches
function createBracketMatches(tournament: Tournament, matches: Match[]): void {
  // Check if bracket matches already exist for round 1
  const existingBracketMatches = matches.filter(m =>
    m.tournamentId === tournament.id &&
    m.round === 'bracket' &&
    (m.bracketRound || 1) === 1
  );

  if (existingBracketMatches.length > 0) {
    return; // Already created
  }

  // Get round robin matches to determine rankings
  const roundRobinMatches = matches.filter(m => m.tournamentId === tournament.id && m.round === 'roundRobin');

  // Count wins for each player
  const playerWins: { [key: string]: number } = {};
  tournament.players.forEach(playerId => {
    playerWins[playerId] = 0;
  });

  roundRobinMatches.forEach(match => {
    if (match.winnerId) {
      playerWins[match.winnerId] = (playerWins[match.winnerId] || 0) + 1;
    }
  });

  // Sort players by wins (descending), then by some tiebreaker if needed
  const rankedPlayers = tournament.players.sort((a, b) => {
    const winsA = playerWins[a] || 0;
    const winsB = playerWins[b] || 0;
    if (winsA !== winsB) return winsB - winsA;
    // Tiebreaker: could be based on game differential, but for now random
    return Math.random() - 0.5;
  });

  // Take top players, but ensure even number for bracket
  const numBracketPlayers = Math.min(rankedPlayers.length, 8);
  const bracketPlayers = rankedPlayers.slice(0, numBracketPlayers);

  // If odd number, remove the last one (or handle bye, but for simplicity remove)
  if (bracketPlayers.length % 2 === 1) {
    bracketPlayers.pop();
  }

  // Create first round bracket matches
  const bracketRound = tournament.bracketRounds[0];
  if (bracketRound && bracketPlayers.length >= 2) {
    // Simple pairing: 1st vs 2nd, 3rd vs 4th, etc. (not snake draft for simplicity)
    for (let i = 0; i < bracketPlayers.length; i += 2) {
      const newMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: bracketPlayers[i],
        player2Id: bracketPlayers[i + 1],
        round: 'bracket',
        bracketRound: bracketRound.round,
        bestOf: bracketRound.bestOf,
        games: [],
      };
      matches.push(newMatch);
}

// Function to advance to next round robin round
function advanceRoundRobinRound(tournament: Tournament, matches: Match[]): Match[] {
  // Find the next round number
  const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id && m.round === 'roundRobin');
  const existingRounds = tournamentMatches.map(m => m.bracketRound || 1);
  const nextRound = existingRounds.length > 0 ? Math.max(...existingRounds) + 1 : 2;

  // Check if we've reached the round robin rounds limit
  if (nextRound > tournament.roundRobinRounds) {
    return []; // No more round robin rounds
  }

  // Sort players by performance for pairing (optional, can be random)
  const shuffledPlayers = [...tournament.players].sort(() => Math.random() - 0.5);
  return createRoundRobinPairings(shuffledPlayers, tournament.id, matches, nextRound);
}
