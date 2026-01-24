import { NextRequest, NextResponse } from 'next/server';
import { Tournament, Match } from '../../../types/pingpong';
import { Game } from '../../../types/pingpong';
import { getTournaments, setTournaments, getMatches, setMatches, getGames, setGames, saveData } from '../../../data/data';

export async function GET() {
  try {
    const tournaments = getTournaments();
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
    const uniquePlayers = [...new Set(players)];
    if (!name || !roundRobinRounds || !bracketRounds || !uniquePlayers || uniquePlayers.length < 2) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    const tournaments = getTournaments();
    const newTournament: Tournament = {
      id: Date.now().toString(),
      name,
      startDate: new Date().toISOString(),
      status: 'roundRobin',
      roundRobinRounds,
      bracketRounds,
      players: uniquePlayers,
    };
    tournaments.push(newTournament);
    setTournaments(tournaments);

    // Generate first round of round robin matches
    const matches = getMatches();

    // Create balanced pairings for first round
    const shuffledPlayers = [...uniquePlayers].sort(() => Math.random() - 0.5);
    createRoundRobinPairings(shuffledPlayers, newTournament.id, matches, 1);

    setMatches(matches);
    saveData();

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
    
    const tournaments = getTournaments();
    const tournament = tournaments.find(t => t.id === id);

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const matches = getMatches();
    
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

        setMatches(matches);
        saveData();
      } else if (tournament.status === 'bracket') {
        // Advance bracket round
        const advanced = advanceBracketRound(tournament, matches);
        if (!advanced) {
          return NextResponse.json({ error: 'Cannot advance bracket round' }, { status: 400 });
        }
        setMatches(matches);
        saveData();
      }
    }
    
    if (status) {
      const oldStatus = tournament.status;
      tournament.status = status;
      // If changing to bracket status or already bracket but no matches, create bracket matches
      if (status === 'bracket' && (oldStatus !== 'bracket' || !matches.some(m => m.tournamentId === tournament.id && m.round === 'bracket'))) {
        createBracketMatches(tournament, matches);
        setMatches(matches);
        saveData();
      }
    }

    setTournaments(tournaments);
    saveData();
    return NextResponse.json(tournament);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update tournament' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Tournament ID required' }, { status: 400 });
    }

    const tournaments = getTournaments();
    const tournamentIndex = tournaments.findIndex(t => t.id === id);
    if (tournamentIndex === -1) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Remove the tournament
    tournaments.splice(tournamentIndex, 1);
    setTournaments(tournaments);

    // Remove associated matches
    const matches = getMatches();
    const filteredMatches = matches.filter(m => m.tournamentId !== id);
    setMatches(filteredMatches);

    // Remove associated games
    const games = getGames();
    const filteredGames = games.filter(g => !filteredMatches.some(m => m.id === g.matchId));
    setGames(filteredGames);

    return NextResponse.json({ message: 'Tournament deleted successfully' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete tournament' }, { status: 500 });
  }
}

// Helper function to create a single round of round robin pairings
function createRoundRobinPairings(players: string[], tournamentId: string, matches: Match[], bracketRound: number = 1): Match[] {
  const newMatches: Match[] = [];
  const shuffled = [...players];

  // If odd number of players, the last one gets a bye
  let byePlayer: string | null = null;
  if (shuffled.length % 2 === 1) {
    byePlayer = shuffled.pop()!;
  }

  // Pair the remaining players
  for (let i = 0; i < shuffled.length; i += 2) {
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

  // Create bye match if any
  if (byePlayer) {
    const byeMatch: Match = {
      id: Date.now().toString() + Math.random(),
      tournamentId,
      player1Id: byePlayer,
      player2Id: 'BYE',
      round: 'roundRobin',
      bracketRound: bracketRound,
      bestOf: 1,
      games: [],
      winnerId: byePlayer, // Automatic win
    };
    newMatches.push(byeMatch);
    matches.push(byeMatch);
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

  if (winners.length < 2) {
    // Tournament completed
    tournament.status = 'completed';
    return true;
  }

  // Find next bracket round config
  const nextBracketRoundConfig = tournament.bracketRounds.find(br => br.round === currentRound + 1);
  let bestOf = 1; // default
  if (nextBracketRoundConfig) {
    bestOf = nextBracketRoundConfig.bestOf;
  } else {
    // Use the bestOf from the last configured round
    const lastConfig = tournament.bracketRounds[tournament.bracketRounds.length - 1];
    if (lastConfig) {
      bestOf = lastConfig.bestOf;
    }
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
        bracketRound: currentRound + 1,
        bestOf: bestOf,
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

  // Take top players for bracket
  const numBracketPlayers = Math.min(rankedPlayers.length, 8);
  const bracketPlayers = rankedPlayers.slice(0, numBracketPlayers);

  // Create first round bracket matches
  const bracketRound = tournament.bracketRounds[0];
  if (bracketRound && bracketPlayers.length >= 2) {
    let startIndex = 0;
    // If odd number, give bye to the top player
    if (bracketPlayers.length % 2 === 1) {
      const byeMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: bracketPlayers[0],
        player2Id: 'BYE',
        round: 'bracket',
        bracketRound: bracketRound.round,
        bestOf: bracketRound.bestOf,
        games: [],
        winnerId: bracketPlayers[0], // Automatic win
      };
      matches.push(byeMatch);
      startIndex = 1; // Start pairing from the next player
    }

    // Pair the remaining players: 1st vs 2nd, 3rd vs 4th, etc.
    for (let i = startIndex; i < bracketPlayers.length; i += 2) {
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
  }
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
