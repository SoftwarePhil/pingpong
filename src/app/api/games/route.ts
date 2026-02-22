import { NextRequest, NextResponse } from 'next/server';
import { Game, Match } from '../../../types/pingpong';
import { getAllGames, addGameToMatch, setTournament, registerMatchesIndex } from '../../../data/data';
import { validateScore } from '../../../lib/scoring';

export async function GET() {
  try {
    const games = await getAllGames();
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
    const scoreError = validateScore(score1, score2);
    if (scoreError) {
      return NextResponse.json({ error: scoreError }, { status: 400 });
    }

    const newGame: Game = {
      id: Date.now().toString(),
      matchId,
      player1Id,
      player2Id,
      score1,
      score2,
      date: new Date().toISOString(),
    };

    if (matchId) {
      const result = await addGameToMatch(newGame);
      if (!result) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }

      // Handle play-in match completion (bracketRound === 0 is the play-in round)
      const { match, tournament } = result;
      if (match.winnerId && match.bracketRound === 0 && tournament.players.length % 2 === 1) {
        const rankedPlayers = tournament.playerRanking || tournament.players;
        if (rankedPlayers.length >= 3) {
          const mainBracketPlayers = [
            rankedPlayers[0], // 1st place (round robin)
            rankedPlayers[1], // 2nd place
            rankedPlayers[2], // 3rd place
            match.winnerId,   // Play-in winner
          ];
          const mainMatchCount = mainBracketPlayers.length / 2;
          const bracketConfig = tournament.bracketRounds.find(b => b.matchCount === mainMatchCount);
          const mainBestOf = bracketConfig?.bestOf ?? 1;
          const newMatches: Match[] = [];
          for (let i = 0; i < mainBracketPlayers.length; i += 2) {
            newMatches.push({
              id: Date.now().toString() + Math.random(),
              tournamentId: tournament.id,
              player1Id: mainBracketPlayers[i],
              player2Id: mainBracketPlayers[i + 1],
              round: 'bracket',
              bracketRound: 1,
              bestOf: mainBestOf,
              games: [],
            });
          }
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...newMatches);
          await registerMatchesIndex(newMatches);
          await setTournament(tournament);
        }
      }
    }

    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add game' }, { status: 500 });
  }
}
