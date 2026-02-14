import { NextRequest, NextResponse } from 'next/server';
import { Game, Match } from '../../../types/pingpong';
import { getGames, setGames, getMatches, setMatches, saveData, getTournament, setTournament } from '../../../data/data';

export async function GET() {
  try {
    const games = await getGames();
    return NextResponse.json(games);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read games' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player1Id, player2Id, score1, score2, matchId }: { player1Id: string; player2Id: string; score1: number; score2: number; matchId?: string } = body;
    if (!player1Id || !player2Id || score1 === undefined || score2 === undefined) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Validate ping pong scoring rules (deuce logic)
    const maxScore = Math.max(score1, score2);
    const minScore = Math.min(score1, score2);
    const scoreDifference = maxScore - minScore;
    if (maxScore < 11) {
      return NextResponse.json({ error: 'Game must reach 11 points to be complete' }, { status: 400 });
    }
    else{
    if (maxScore > 11 && (scoreDifference !== 2)) {
      return NextResponse.json({ error: 'Game must be won by 2 points' }, { status: 400 });
    }}

    const games = await getGames();
    const newGame: Game = {
      id: Date.now().toString(),
      matchId,
      player1Id,
      player2Id,
      score1,
      score2,
      date: new Date().toISOString(),
    };
    games.push(newGame);
    await setGames(games);

    // Update match if matchId provided
    if (matchId) {
      const matches = await getMatches();
      const match = matches.find(m => m.id === matchId);
      if (match) {
        match.games.push(newGame);
        // Check if match is complete
        const p1Wins = match.games.filter(g => g.score1 > g.score2).length;
        const p2Wins = match.games.filter(g => g.score2 > g.score1).length;
        const requiredWins = Math.ceil(match.bestOf / 2);
        if (p1Wins >= requiredWins) {
          match.winnerId = match.player1Id;
        } else if (p2Wins >= requiredWins) {
          match.winnerId = match.player2Id;
        }

        // Update global matches array
        await setMatches(matches);

        // Also update embedded match in tournament document
        const tournament = await getTournament(match.tournamentId);
        if (tournament && tournament.matches) {
          const embeddedMatchIndex = tournament.matches.findIndex(m => m.id === matchId);
          if (embeddedMatchIndex !== -1) {
            tournament.matches[embeddedMatchIndex] = match;
            await setTournament(tournament);
          }
        }

        // Handle play-in match completion
        if (match.winnerId && match.bracketRound === 0) {
          // This was a play-in match, create the main bracket matches now
          const tournamentDoc = await getTournament(match.tournamentId);
          const allMatches = await getMatches();

          if (tournamentDoc && tournamentDoc.players.length % 2 === 1) {
            // For odd number of players, create main bracket with play-in winner
            const rankedPlayers = tournamentDoc.playerRanking || tournamentDoc.players;
            const mainBracketPlayers = [
              rankedPlayers[0], // 1st place
              rankedPlayers[1], // 2nd place
              rankedPlayers[2], // 3rd place
              match.winnerId!  // Play-in winner
            ];

            const bracketRound = tournamentDoc.bracketRounds[0];
            const newMatches: Match[] = [];

            // Create round 1 matches for main bracket
            for (let i = 0; i < mainBracketPlayers.length; i += 2) {
              const newMatch: Match = {
                id: Date.now().toString() + Math.random(),
                tournamentId: tournamentDoc.id,
                player1Id: mainBracketPlayers[i],
                player2Id: mainBracketPlayers[i + 1],
                round: 'bracket',
                bracketRound: bracketRound.round,
                bestOf: bracketRound.bestOf,
                games: [],
              };
              allMatches.push(newMatch);
              newMatches.push(newMatch);
            }

            // Add to tournament embedded matches
            if (!tournamentDoc.matches) tournamentDoc.matches = [];
            tournamentDoc.matches.push(...newMatches);

            await setMatches(allMatches);
            await setTournament(tournamentDoc);
          }
        }

        await saveData();
      }
    }

    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add game' }, { status: 500 });
  }
}
