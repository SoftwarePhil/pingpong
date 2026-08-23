import { NextRequest, NextResponse } from 'next/server';
import { Game } from '../../../types/pingpong';
import { getAllGames, addGameToMatch, setTournament, getMatch, getTournament } from '../../../data/data';
import { validateScore } from '../../../lib/scoring';
import { replacePlayInWinnerSlot } from '../../../lib/tournament';
import { requireAdmin } from '../../../lib/auth';
import { getMatchSides, isDoublesMatch } from '../../../lib/matchFormat';

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
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const { player1Id, player2Id, score1, score2, matchId }: { player1Id?: string; player2Id?: string; score1?: number; score2?: number; matchId?: string } = body;
    if (score1 === undefined || score2 === undefined || (!matchId && (!player1Id || !player2Id))) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Validate ping pong scoring rules (deuce logic)
    const scoreError = validateScore(score1, score2);
    if (scoreError) {
      return NextResponse.json({ error: scoreError }, { status: 400 });
    }

    let newGame: Game;
    if (matchId) {
      const existingMatch = await getMatch(matchId);
      if (!existingMatch) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }
      const tournamentForLock = await getTournament(existingMatch.tournamentId);
      const bracketStarted = Boolean(
        tournamentForLock?.bracketStartedAt ||
        (tournamentForLock?.matches ?? []).some(m => m.round === 'bracket') ||
        tournamentForLock?.status === 'bracket'
      );
      if (existingMatch.round === 'roundRobin' && bracketStarted) {
        return NextResponse.json(
          { error: 'Cannot record round robin games after bracket has started' },
          { status: 400 }
        );
      }

      const [side1, side2] = getMatchSides(existingMatch);
      newGame = {
        id: Date.now().toString(),
        matchId,
        // These required legacy fields remain deterministic compatibility
        // references; side arrays are authoritative for doubles.
        player1Id: side1[0],
        player2Id: side2[0],
        ...(isDoublesMatch(existingMatch) && {
          side1PlayerIds: side1,
          side2PlayerIds: side2,
        }),
        score1,
        score2,
        date: new Date().toISOString(),
      };

      const result = await addGameToMatch(newGame);
      if (!result) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }

      // Handle play-in match completion (bracketRound === 0 is the play-in round).
      // Replace only the R1 slot fed by this specific preliminary match. This
      // also supports brackets with multiple indexed play-in placeholders.
      const { match, tournament } = result;
      if (match.winnerId && match.bracketRound === 0) {
        const updatedMatches = replacePlayInWinnerSlot(
          tournament.matches ?? [],
          match.id,
          match.winnerId,
        );
        if (updatedMatches !== tournament.matches) {
          tournament.matches = updatedMatches;
          await setTournament(tournament);
        }
      }
    } else {
      newGame = {
        id: Date.now().toString(),
        player1Id: player1Id!,
        player2Id: player2Id!,
        score1,
        score2,
        date: new Date().toISOString(),
      };
    }

    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add game' }, { status: 500 });
  }
}
