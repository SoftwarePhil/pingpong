import { NextRequest, NextResponse } from 'next/server';
import { Match } from '../../../../types/pingpong';
import { getMatch, getTournamentIdForMatch, getTournament, setTournament, updateMatchInTournament, removeMatchFromTournament, saveData } from '../../../../data/data';
import { cascadeRoundRobinPlayerSwap, cascadeBracketR1PlayerSwap } from '../../../../lib/tournament';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;
    const updates = await request.json();

    const currentMatch = await getMatch(matchId);
    if (!currentMatch) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Player reassignment — cascade changes to other matches in the same round
    if (updates.player1Id !== undefined || updates.player2Id !== undefined) {
      const isRR = currentMatch.round === 'roundRobin';
      const isBracketR1 = currentMatch.round === 'bracket' && currentMatch.bracketRound === 1;

      if (!isRR && !isBracketR1) {
        return NextResponse.json({ error: 'Players can only be changed in round robin or bracket round 1 matches' }, { status: 400 });
      }
      if (currentMatch.games.length > 0) {
        return NextResponse.json({ error: 'Cannot change players after games have been played' }, { status: 400 });
      }

      const newP1 = updates.player1Id ?? currentMatch.player1Id;
      const newP2 = updates.player2Id ?? currentMatch.player2Id;

      if (newP1 === newP2) {
        return NextResponse.json({ error: 'Player 1 and Player 2 must be different' }, { status: 400 });
      }

      // Load the tournament and cascade all changes in memory, then save once
      const tournamentId = await getTournamentIdForMatch(matchId);
      if (!tournamentId) {
        return NextResponse.json({ error: 'Tournament not found for match' }, { status: 404 });
      }
      const tournament = await getTournament(tournamentId);
      if (!tournament?.matches) {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }

      if (isRR) {
        tournament.matches = cascadeRoundRobinPlayerSwap(tournament.matches, matchId, newP1, newP2);
      } else {
        tournament.matches = cascadeBracketR1PlayerSwap(tournament.matches, matchId, newP1, newP2);
      }

      await setTournament(tournament);
      await saveData();

      const updatedMatch = tournament.matches.find(m => m.id === matchId)!;
      return NextResponse.json(updatedMatch);
    }

    // Non-player update (scores, winnerId, etc.) — standard path
    const updatedMatch: Match = { ...currentMatch, ...updates };
    const tournament = await updateMatchInTournament(updatedMatch);
    if (!tournament) {
      return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
    }

    return NextResponse.json(updatedMatch);
  } catch (error) {
    console.error('Error updating match:', error);
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;

    const result = await removeMatchFromTournament(matchId);
    if (!result) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Match and associated games deleted successfully',
      deletedMatch: result.match,
    });
  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
