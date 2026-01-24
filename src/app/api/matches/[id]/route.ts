import { NextRequest, NextResponse } from 'next/server';
import { Match, Game } from '../../../../types/pingpong';
import { getMatches, setMatches, getGames, setGames } from '../../../../data/data';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;
    const updates = await request.json();

    // Read current matches
    const matchesData = getMatches();

    // Find and update the match
    const matchIndex = matchesData.findIndex((match: Match) => match.id === matchId);
    if (matchIndex === -1) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Update the match with the provided fields
    matchesData[matchIndex] = { ...matchesData[matchIndex], ...updates };

    // Write updated data back
    setMatches(matchesData);

    return NextResponse.json(matchesData[matchIndex]);

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

    // Read current matches
    const matchesData = getMatches();

    // Find the match to delete
    const matchIndex = matchesData.findIndex((match: Match) => match.id === matchId);
    if (matchIndex === -1) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const matchToDelete = matchesData[matchIndex];

    // Read current games
    const gamesData = getGames();

    // Remove all games associated with this match
    const updatedGames = gamesData.filter((game: Game) => game.matchId !== matchId);

    // Remove the match
    matchesData.splice(matchIndex, 1);

    // Write updated data back
    setMatches(matchesData);
    setGames(updatedGames);

    return NextResponse.json({
      message: 'Match and associated games deleted successfully',
      deletedMatch: matchToDelete
    });

  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
