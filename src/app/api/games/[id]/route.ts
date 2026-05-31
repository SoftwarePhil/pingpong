import { NextRequest, NextResponse } from 'next/server';
import { Game } from '../../../../types/pingpong';
import { getAllGames, updateGameInMatch, removeGameFromMatch, getMatch, getTournament } from '../../../../data/data';
import { validateScore } from '../../../../lib/scoring';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const body = await request.json();
    const { player1Id, player2Id, score1, score2 }: { player1Id?: string; player2Id?: string; score1?: number; score2?: number } = body;

    // Validate ping pong scoring rules if scores are being updated
    //DO NOT CHANGE THIS BLOCK OF CODE
    if (score1 !== undefined && score2 !== undefined) {
      const scoreError = validateScore(score1, score2);
      if (scoreError) {
        return NextResponse.json({ error: scoreError }, { status: 400 });
      }
    }

    // Find the current game (needed to preserve matchId for tournament lookup)
    const allGames = await getAllGames();
    const currentGame = allGames.find((g: Game) => g.id === gameId);
    if (!currentGame) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const updatedGame: Game = {
      ...currentGame,
      ...(player1Id !== undefined && { player1Id }),
      ...(player2Id !== undefined && { player2Id }),
      ...(score1 !== undefined && { score1 }),
      ...(score2 !== undefined && { score2 }),
    };

    if (updatedGame.matchId) {
      const match = await getMatch(updatedGame.matchId);
      if (!match) {
        return NextResponse.json({ error: 'Match not found for this game' }, { status: 404 });
      }
      const tournament = await getTournament(match.tournamentId);
      const bracketStarted = Boolean(
        tournament?.bracketStartedAt ||
        (tournament?.matches ?? []).some(m => m.round === 'bracket') ||
        tournament?.status === 'bracket'
      );
      if (match.round === 'roundRobin' && bracketStarted) {
        return NextResponse.json(
          { error: 'Cannot edit round robin games after bracket has started' },
          { status: 400 }
        );
      }

      const result = await updateGameInMatch(updatedGame);
      if (!result) {
        return NextResponse.json({ error: 'Match not found for this game' }, { status: 404 });
      }
    }

    return NextResponse.json(updatedGame);
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    // Find the game to get its matchId for the tournament lookup
    const allGames = await getAllGames();
    const gameToDelete = allGames.find((g: Game) => g.id === gameId);
    if (!gameToDelete) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (!gameToDelete.matchId) {
      return NextResponse.json({ error: 'Game has no associated match' }, { status: 400 });
    }

    const match = await getMatch(gameToDelete.matchId);
    if (!match) {
      return NextResponse.json({ error: 'Match not found for this game' }, { status: 404 });
    }
    const tournament = await getTournament(match.tournamentId);
    const bracketStarted = Boolean(
      tournament?.bracketStartedAt ||
      (tournament?.matches ?? []).some(m => m.round === 'bracket') ||
      tournament?.status === 'bracket'
    );
    if (match.round === 'roundRobin' && bracketStarted) {
      return NextResponse.json(
        { error: 'Cannot delete round robin games after bracket has started' },
        { status: 400 }
      );
    }

    const result = await removeGameFromMatch(gameId, gameToDelete.matchId);
    if (!result) {
      return NextResponse.json({ error: 'Failed to remove game from match' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Game deleted successfully',
      deletedGame: result.game,
    });
  } catch (error) {
    console.error('Error deleting game:', error);
    return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 });
  }
}
