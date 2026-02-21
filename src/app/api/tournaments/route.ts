import { NextRequest, NextResponse } from 'next/server';
import { Tournament, Match } from '../../../types/pingpong';
import { getTournaments, setTournaments, saveData, setTournament, getTournament, deleteTournament, registerMatchesIndex, syncTournamentPlayers } from '../../../data/data';

export async function GET() {
  try {
    const tournaments = await getTournaments();
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
    const newTournament: Tournament = {
      id: Date.now().toString(),
      name,
      startDate: new Date().toISOString(),
      status: 'roundRobin',
      roundRobinRounds,
      bracketRounds,
      players: uniquePlayers,
      matches: [], // Will be populated with embedded matches
    };

    // Create first round robin pairings
    const shuffledPlayers = [...uniquePlayers].sort(() => Math.random() - 0.5);
    const embeddedMatches = createRoundRobinPairings(shuffledPlayers, newTournament.id, 1);

    // Embed matches in tournament document
    newTournament.matches = embeddedMatches;

    // Save tournament, sync player records, and register matches in the index
    await setTournament(newTournament);
    await syncTournamentPlayers(newTournament);
    await registerMatchesIndex(embeddedMatches);
    await saveData();

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

    const tournament = await getTournament(id);

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

if (action === 'advanceRound') {
      if (tournament.status === 'roundRobin') {
        // Check if all current round matches are completed
        const currentRoundMatches = (tournament.matches ?? []).filter(m =>
          m.round === 'roundRobin' &&
          !m.winnerId
        );

        if (currentRoundMatches.length > 0) {
          return NextResponse.json({ error: 'Current round is not complete' }, { status: 400 });
        }

        // Advance to next round
        const newMatches = advanceRoundRobinRound(tournament);

        if (newMatches.length === 0) {
          // No more round robin rounds — transition to bracket
          tournament.status = 'bracket';
          const bracketMatches = createBracketMatches(tournament);
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...bracketMatches);
          await registerMatchesIndex(bracketMatches);
        } else {
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...newMatches);
          await registerMatchesIndex(newMatches);
        }

        await setTournament(tournament);
        await saveData();
      } else if (tournament.status === 'bracket') {
        // Advance bracket round
        const newBracketMatches = advanceBracketRound(tournament);
        if (newBracketMatches.length === 0 && (tournament.status as string) !== 'completed') {
          return NextResponse.json({ error: 'Cannot advance bracket round' }, { status: 400 });
        }

        if (newBracketMatches.length > 0) {
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...newBracketMatches);
          await registerMatchesIndex(newBracketMatches);
        }

        await setTournament(tournament);
        await saveData();
      }
    }

    if (status) {
      const oldStatus = tournament.status;
      tournament.status = status;
      // If changing to bracket status or already bracket but no matches, create bracket matches
      if (status === 'bracket' && (oldStatus !== 'bracket' || !(tournament.matches ?? []).some(m => m.round === 'bracket'))) {
        const bracketMatches = createBracketMatches(tournament, false); // Don't create main bracket yet
        if (!tournament.matches) tournament.matches = [];
        tournament.matches.push(...bracketMatches);
        await registerMatchesIndex(bracketMatches);
        await saveData();
      }
    }

    await setTournament(tournament);
    await saveData();
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

    const tournament = await getTournament(id);
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Deletes tournament doc, removes from indexes, cleans match index, removes player refs
    await deleteTournament(id);

    return NextResponse.json({ message: 'Tournament deleted successfully' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete tournament' }, { status: 500 });
  }
}

// Helper function to create a single round of round robin pairings
function createRoundRobinPairings(players: string[], tournamentId: string, bracketRound: number = 1): Match[] {
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
  }

  return newMatches;
}

// Function to advance bracket round
function advanceBracketRound(tournament: Tournament): Match[] {
  const newMatches: Match[] = [];

  // Exclude play-in matches (bracketRound === 0) — they are handled separately
  // when their game is recorded. Including them here would treat the play-in winner
  // as an extra Round 1 winner, causing a phantom bye in Round 2.
  const bracketMatches = (tournament.matches ?? []).filter(
    m => m.round === 'bracket' && (m.bracketRound ?? 0) > 0
  );
  if (bracketMatches.length === 0) {
    return []; // No bracket matches exist
  }

  const currentRound = Math.max(...bracketMatches.map(m => m.bracketRound ?? 1));
  const currentRoundMatches = bracketMatches.filter(m => (m.bracketRound ?? 1) === currentRound);

  // Check if all current round matches are completed
  const incompleteMatches = currentRoundMatches.filter(m => !m.winnerId);
  if (incompleteMatches.length > 0) {
    return []; // Current round not complete
  }

  // Get winners
  const winners = currentRoundMatches.map(m => m.winnerId).filter(id => id) as string[];

  if (winners.length < 2) {
    // Tournament completed
    tournament.status = 'completed';
    return [];
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

  // Sort winners by seeding to maintain bracket integrity
  if (tournament.playerRanking) {
    winners.sort((a, b) => {
      const indexA = tournament.playerRanking!.indexOf(a);
      const indexB = tournament.playerRanking!.indexOf(b);
      return indexA - indexB;
    });
  }

  // Ensure bye players don't play each other in the next round
  const byePlayers = (tournament.matches ?? [])
    .filter(m => m.bracketRound === 1 && m.player2Id === 'BYE')
    .map(m => m.player1Id);

  if (winners.length >= 3 && byePlayers.includes(winners[0]) && byePlayers.includes(winners[1])) {
    [winners[1], winners[2]] = [winners[2], winners[1]];
  }

  // Handle byes: if odd number of winners, the last one gets a bye
  let playersForNextRound = [...winners];
  if (winners.length % 2 === 1) {
    if (currentRound === 1) {
      playersForNextRound = winners.slice(0, -1);
      const byePlayer = winners[winners.length - 1];

      const byeMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: byePlayer,
        player2Id: 'BYE',
        round: 'bracket',
        bracketRound: currentRound + 1,
        bestOf: 1,
        games: [],
        winnerId: byePlayer,
      };
      newMatches.push(byeMatch);
    } else {
      playersForNextRound = winners;
    }
  }

  for (let i = 0; i < playersForNextRound.length; i += 2) {
    if (i + 1 < playersForNextRound.length) {
      const newMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: playersForNextRound[i],
        player2Id: playersForNextRound[i + 1],
        round: 'bracket',
        bracketRound: currentRound + 1,
        bestOf: bestOf,
        games: [],
      };
      newMatches.push(newMatch);
    }
  }

  return newMatches;
}

// Function to create bracket matches
function createBracketMatches(tournament: Tournament, createMainBracket = true): Match[] {
  const newMatches: Match[] = [];
  // Check if bracket matches already exist for round 1
  const existingBracketMatches = (tournament.matches ?? []).filter(m =>
    m.round === 'bracket' &&
    (m.bracketRound || 1) >= 1
  );

  if (existingBracketMatches.length > 0) {
    return []; // Already created
  }

  // Get round robin matches to determine rankings
  const roundRobinMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');

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

  // Sort players by wins (descending)
  const rankedPlayers = [...tournament.players].sort((a, b) => {
    const winsA = playerWins[a] || 0;
    const winsB = playerWins[b] || 0;
    if (winsA !== winsB) return winsB - winsA;
    return Math.random() - 0.5;
  });

  const bracketPlayers = rankedPlayers;

  // Set player ranking on tournament
  tournament.playerRanking = rankedPlayers;

  // Create bracket matches
  const bracketRound = tournament.bracketRounds[0];
  if (bracketRound && bracketPlayers.length >= 2) {
    if (bracketPlayers.length % 2 === 1) {
      // Odd number of players: create a play-in round first
      const playInMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: bracketPlayers[bracketPlayers.length - 2], // 4th place
        player2Id: bracketPlayers[bracketPlayers.length - 1], // 5th place
        round: 'bracket',
        bracketRound: 0, // Play-in round
        bestOf: bracketRound.bestOf,
        games: [],
      };
      newMatches.push(playInMatch);

      if (createMainBracket) {
        const mainBracketPlayers = [
          bracketPlayers[0],
          bracketPlayers[1],
          bracketPlayers[2],
          'PLAY_IN_WINNER',
        ];

        for (let i = 0; i < mainBracketPlayers.length; i += 2) {
          const newMatch: Match = {
            id: Date.now().toString() + Math.random(),
            tournamentId: tournament.id,
            player1Id: mainBracketPlayers[i],
            player2Id: mainBracketPlayers[i + 1],
            round: 'bracket',
            bracketRound: bracketRound.round,
            bestOf: bracketRound.bestOf,
            games: [],
          };
          newMatches.push(newMatch);
        }
      }
    } else {
      // Even number of players: create balanced bracket with byes if needed
      const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(bracketPlayers.length)));
      const numByes = nextPowerOf2 - bracketPlayers.length;

      for (let i = 0; i < numByes; i++) {
        const byeMatch: Match = {
          id: Date.now().toString() + Math.random(),
          tournamentId: tournament.id,
          player1Id: bracketPlayers[i],
          player2Id: 'BYE',
          round: 'bracket',
          bracketRound: bracketRound.round,
          bestOf: bracketRound.bestOf,
          games: [],
          winnerId: bracketPlayers[i],
        };
        newMatches.push(byeMatch);
      }

      for (let i = numByes; i < bracketPlayers.length; i += 2) {
        if (i + 1 < bracketPlayers.length) {
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
          newMatches.push(newMatch);
        }
      }
    }
  }

  return newMatches;
}

// Function to advance to next round robin round
function advanceRoundRobinRound(tournament: Tournament): Match[] {
  // Find the next round number
  const tournamentMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
  const existingRounds = tournamentMatches.map(m => m.bracketRound || 1);
  const nextRound = existingRounds.length > 0 ? Math.max(...existingRounds) + 1 : 2;

  // Check if we've reached the round robin rounds limit
  if (nextRound > tournament.roundRobinRounds) {
    return []; // No more round robin rounds
  }

  // Sort players by performance for pairing (optional, can be random)
  const shuffledPlayers = [...tournament.players].sort(() => Math.random() - 0.5);
  return createRoundRobinPairings(shuffledPlayers, tournament.id, nextRound);
}
