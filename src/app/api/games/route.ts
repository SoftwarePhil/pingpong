import { NextRequest, NextResponse } from 'next/server';
import { Game, Match } from '../../../types/pingpong';
import { getAllGames, addGameToMatch, setTournament, registerMatchesIndex } from '../../../data/data';
import { validateScore } from '../../../lib/scoring';
import { generateBracketSeeding } from '../../../lib/tournament';

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
      const bracketPool = tournament.activePlayers ?? tournament.players;
      if (match.winnerId && match.bracketRound === 0 && bracketPool.length % 2 === 1) {
        const rankedPlayers = tournament.playerRanking || bracketPool;
        if (rankedPlayers.length >= 3) {
          // Top (n-2) seeds + actual play-in winner, seeded properly
          const mainBracketPlayers: string[] = [
            ...rankedPlayers.slice(0, rankedPlayers.length - 2),
            match.winnerId,
          ];
          const n = mainBracketPlayers.length;
          const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
          const firstRoundMatchCount = nextPowerOf2 / 2;
          const bracketConfig = tournament.bracketRounds.find(b => b.matchCount === firstRoundMatchCount);
          const mainBestOf = bracketConfig?.bestOf ?? 1;
          const seeding = generateBracketSeeding(nextPowerOf2);
          const newMatches: Match[] = [];

          for (let i = 0; i < seeding.length; i += 2) {
            const p1 = seeding[i]     <= n ? mainBracketPlayers[seeding[i] - 1]     : 'BYE';
            const p2 = seeding[i + 1] <= n ? mainBracketPlayers[seeding[i + 1] - 1] : 'BYE';
            const isBye = p1 === 'BYE' || p2 === 'BYE';
            newMatches.push({
              id: Date.now().toString() + Math.random(),
              tournamentId: tournament.id,
              player1Id: p1,
              player2Id: p2,
              round: 'bracket',
              bracketRound: 1,
              bestOf: isBye ? 1 : mainBestOf,
              games: [],
              ...(isBye ? { winnerId: p1 === 'BYE' ? p2 : p1 } : {}),
            });
          }
          // Reverse the bottom half so seed 2 appears at the bottom
          const half = newMatches.length / 2;
          const orderedMatches = [...newMatches.slice(0, half), ...newMatches.slice(half).reverse()];
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...orderedMatches);
          await registerMatchesIndex(orderedMatches);
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
