import { NextRequest, NextResponse } from 'next/server';
import { Tournament, Match } from '../../../types/pingpong';
import { Game } from '../../../types/pingpong';
import { getTournaments, setTournaments, getMatches, setMatches, getGames, setGames, saveData, setTournament, getTournament, deleteTournament } from '../../../data/data';

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

    // Generate first round of round robin matches
    const globalMatches = await getMatches();

    // Create balanced pairings for first round
    const shuffledPlayers = [...uniquePlayers].sort(() => Math.random() - 0.5);
    const embeddedMatches = createRoundRobinPairings(shuffledPlayers, newTournament.id, globalMatches, 1);

    // Embed matches in tournament document
    newTournament.matches = embeddedMatches;

    // Save tournament with embedded matches
    await setTournament(newTournament);

    // Also save to global matches array for player stats compatibility
    await setMatches(globalMatches);
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

    const matches = await getMatches();

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
          const bracketMatches = createBracketMatches(tournament, matches);
          // Add bracket matches to embedded matches
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...bracketMatches);
        } else {
          // Add new round robin matches to embedded matches
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...newMatches);
        }

        await setTournament(tournament);
        await setMatches(matches);
        await saveData();
      } else if (tournament.status === 'bracket') {
        // Advance bracket round
        const newBracketMatches = advanceBracketRound(tournament, matches);
        if (newBracketMatches.length === 0 && (tournament.status as string) !== 'completed') {
          return NextResponse.json({ error: 'Cannot advance bracket round' }, { status: 400 });
        }

        // Add new bracket matches to embedded matches (if any)
        if (newBracketMatches.length > 0) {
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...newBracketMatches);
          await setTournament(tournament);
        }

        await setMatches(matches);
        await saveData();
      }
    }

    if (status) {
      const oldStatus = tournament.status;
      tournament.status = status;
      // If changing to bracket status or already bracket but no matches, create bracket matches
      if (status === 'bracket' && (oldStatus !== 'bracket' || !matches.some(m => m.tournamentId === tournament.id && m.round === 'bracket'))) {
        const bracketMatches = createBracketMatches(tournament, matches, false); // Don't create main bracket yet
        // Add bracket matches to embedded matches
        if (!tournament.matches) tournament.matches = [];
        tournament.matches.push(...bracketMatches);
        await setMatches(matches);
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

    // Check if tournament exists
    const tournament = await getTournament(id);
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Delete tournament document and update indexes
    await deleteTournament(id);

    // Remove associated matches from global array
    const matches = await getMatches();
    const filteredMatches = matches.filter(m => m.tournamentId !== id);
    await setMatches(filteredMatches);

    // Remove associated games from global array
    const games = await getGames();
    const matchIds = filteredMatches.map(m => m.id);
    const filteredGames = games.filter(g => matchIds.includes(g.matchId || ''));
    await setGames(filteredGames);

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
function advanceBracketRound(tournament: Tournament, matches: Match[]): Match[] {
  const newMatches: Match[] = [];

  // Find current bracket round
  const bracketMatches = matches.filter(m => m.tournamentId === tournament.id && m.round === 'bracket');
  if (bracketMatches.length === 0) {
    return []; // No bracket matches exist
  }

  const currentRound = Math.max(...bracketMatches.map(m => m.bracketRound || 1));
  const currentRoundMatches = bracketMatches.filter(m => (m.bracketRound || 1) === currentRound);

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
  // Identify players who got byes in round 1
  const byePlayers = matches
    .filter(m => m.tournamentId === tournament.id && m.bracketRound === 1 && m.player2Id === 'BYE')
    .map(m => m.player1Id);

  // If the first two winners are both bye players, swap the second with the third
  // This puts bye players at positions 0 and 2 instead of 0 and 1
  if (winners.length >= 3 && byePlayers.includes(winners[0]) && byePlayers.includes(winners[1])) {
    [winners[1], winners[2]] = [winners[2], winners[1]];
  }

  // Handle byes: if odd number of winners, the last one gets a bye
  let playersForNextRound = [...winners];
  if (winners.length % 2 === 1) {
    if (currentRound === 1) {
      // For round 1, create bye matches as before
      playersForNextRound = winners.slice(0, -1);
      const byePlayer = winners[winners.length - 1];

      // Create a bye match for the next round (byes always advance the player)
      const byeMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: byePlayer,
        player2Id: 'BYE',
        round: 'bracket',
        bracketRound: currentRound + 1,
        bestOf: 1, // Bye matches are best of 1
        games: [],
        winnerId: byePlayer, // Automatically set winner
      };
      matches.push(byeMatch);
      newMatches.push(byeMatch);
    } else {
      // For round 2 and beyond, don't create bye matches - just advance all players
      // The odd player automatically advances without a match
      playersForNextRound = winners;
    }
  }

  // Create next round matches by pairing remaining players
  // For round 2+, if odd number of players, pair as many as possible and let the last advance automatically
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
      matches.push(newMatch);
      newMatches.push(newMatch);
    }
    // If this is the last player and we have odd number, they automatically advance
    // No match created for them
  }

  return newMatches;
}

// Function to create bracket matches
function createBracketMatches(tournament: Tournament, matches: Match[], createMainBracket = true): Match[] {
  const newMatches: Match[] = [];
  // Check if bracket matches already exist for round 1
  const existingBracketMatches = matches.filter(m =>
    m.tournamentId === tournament.id &&
    m.round === 'bracket' &&
    (m.bracketRound || 1) >= 1
  );

  if (existingBracketMatches.length > 0) {
    return []; // Already created
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
  const rankedPlayers = [...tournament.players].sort((a, b) => {
    const winsA = playerWins[a] || 0;
    const winsB = playerWins[b] || 0;
    if (winsA !== winsB) return winsB - winsA;
    // Tiebreaker: could be based on game differential, but for now random
    return Math.random() - 0.5;
  });

  // Take all players for bracket (no artificial limit)
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
      matches.push(playInMatch);
      newMatches.push(playInMatch);

      // Only create main bracket if requested
      if (createMainBracket) {
        // Main bracket with top 3 players + play-in winner placeholder
        const mainBracketPlayers = [
          bracketPlayers[0], // 1st place
          bracketPlayers[1], // 2nd place
          bracketPlayers[2], // 3rd place
          'PLAY_IN_WINNER'  // Placeholder for play-in winner
        ];

        // Create round 1 matches for main bracket
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
          matches.push(newMatch);
          newMatches.push(newMatch);
        }
      }
    } else {
      // Even number of players: create balanced bracket with byes if needed
      // Find the next power of 2 that can accommodate all players
      const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(bracketPlayers.length)));
      const numByes = nextPowerOf2 - bracketPlayers.length;

      // Give byes to the top seeded players
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
          winnerId: bracketPlayers[i], // Automatic win
        };
        matches.push(byeMatch);
        newMatches.push(byeMatch);
      }

      // Create matches for the remaining players
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
          matches.push(newMatch);
          newMatches.push(newMatch);
        }
      }
    }
  }

  return newMatches;
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
