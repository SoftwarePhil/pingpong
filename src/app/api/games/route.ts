import { NextRequest, NextResponse } from 'next/server';
import { Game, Match } from '../../../types/pingpong';
import { getAllGames, addGameToMatch, setTournament, registerMatchesIndex, unregisterMatchesIndex, getMatch, getTournament } from '../../../data/data';
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

      const result = await addGameToMatch(newGame);
      if (!result) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }

      // Handle play-in match completion (bracketRound === 0 is the play-in round).
      // Patch ONLY the specific R1 match that still has the 'PLAY_IN_WINNER' placeholder
      // by replacing the placeholder with the actual winnerId on the correct side.
      // This preserves any custom player swaps/reassignments the user made in the preview
      // for the *other* R1 matches. No full re-seed or removal of other matches.
      const { match, tournament } = result;
      const hasPlayInPrelim = (tournament.matches ?? []).some(
        m => m.round === 'bracket' && (m.bracketRound ?? 0) === 0
      );
      if (match.winnerId && match.bracketRound === 0 && hasPlayInPrelim) {
        const matches = tournament.matches ?? [];
        const r1MatchIdx = matches.findIndex(
          m => m.round === 'bracket' &&
               (m.bracketRound ?? 0) === 1 &&
               (m.player1Id === 'PLAY_IN_WINNER' || m.player2Id === 'PLAY_IN_WINNER')
        );
        if (r1MatchIdx !== -1) {
          const r1Match = { ...matches[r1MatchIdx] };
          if (r1Match.player1Id === 'PLAY_IN_WINNER') {
            r1Match.player1Id = match.winnerId;
          } else if (r1Match.player2Id === 'PLAY_IN_WINNER') {
            r1Match.player2Id = match.winnerId;
          }
          // Keep all other fields (bestOf, id, games:[], etc.) as they were from preview/custom creation.
          // Clear any stale winnerId if present (shouldn't be for unplayed).
          r1Match.winnerId = undefined;
          matches[r1MatchIdx] = r1Match;
          tournament.matches = matches;
          await setTournament(tournament);
          // No need to touch match index for an in-place player swap on unplayed match.
        }
      }
    }

    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add game' }, { status: 500 });
  }
}
