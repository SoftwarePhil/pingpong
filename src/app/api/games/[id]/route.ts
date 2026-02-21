import { NextRequest, NextResponse } from 'next/server';
import { Game } from '../../../../types/pingpong';
import { getAllGames, updateGameInMatch, removeGameFromMatch } from '../../../../data/data';

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
      const maxScore = Math.max(score1, score2);
      const minScore = Math.min(score1, score2);
      const scoreDifference = maxScore - minScore;
      if (maxScore < 11) {
        return NextResponse.json({ error: 'Game must reach 11 points to be complete' }, { status: 400 });
      }
      if (maxScore > 11 && scoreDifference !== 2) {
        return NextResponse.json({ error: 'Game must be won by 2 points' }, { status: 400 });
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
