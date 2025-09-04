import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Match, Game } from '../../../../types/pingpong';

const matchesFilePath = path.join(process.cwd(), 'data', 'matches.json');
const gamesFilePath = path.join(process.cwd(), 'data', 'games.json');

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;

    // Read current matches
    const matchesData: Match[] = fs.existsSync(matchesFilePath)
      ? JSON.parse(fs.readFileSync(matchesFilePath, 'utf-8'))
      : [];

    // Find the match to delete
    const matchIndex = matchesData.findIndex((match: Match) => match.id === matchId);
    if (matchIndex === -1) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const matchToDelete = matchesData[matchIndex];

    // Read current games
    const gamesData: Game[] = fs.existsSync(gamesFilePath)
      ? JSON.parse(fs.readFileSync(gamesFilePath, 'utf-8'))
      : [];

    // Remove all games associated with this match
    const updatedGames = gamesData.filter((game: Game) => game.matchId !== matchId);

    // Remove the match
    matchesData.splice(matchIndex, 1);

    // Write updated data back to files
    fs.writeFileSync(matchesFilePath, JSON.stringify(matchesData, null, 2));
    fs.writeFileSync(gamesFilePath, JSON.stringify(updatedGames, null, 2));

    return NextResponse.json({
      message: 'Match and associated games deleted successfully',
      deletedMatch: matchToDelete
    });

  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
