import { NextRequest, NextResponse } from 'next/server';
import { Match, Game } from '../../../../types/pingpong';
import { getMatches, setMatches, getGames, setGames, getTournament, setTournament } from '../../../../data/data';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;
    const updates = await request.json();

    // Read current matches
    const matchesData = await getMatches();

    // Find and update the match
    const matchIndex = matchesData.findIndex((match: Match) => match.id === matchId);
    if (matchIndex === -1) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Update the match with the provided fields
    const updatedMatch = { ...matchesData[matchIndex], ...updates };
    matchesData[matchIndex] = updatedMatch;

    // Also update the embedded match in the tournament document
    const tournament = await getTournament(updatedMatch.tournamentId);
    if (tournament && tournament.matches) {
      const embeddedMatchIndex = tournament.matches.findIndex(m => m.id === matchId);
      if (embeddedMatchIndex !== -1) {
        tournament.matches[embeddedMatchIndex] = updatedMatch;
        await setTournament(tournament);
      }
    }

    // Write updated data back to global matches array
    await setMatches(matchesData);

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

    // Read current matches
    const matchesData = await getMatches();

    // Find the match to delete
    const matchIndex = matchesData.findIndex((match: Match) => match.id === matchId);
    if (matchIndex === -1) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const matchToDelete = matchesData[matchIndex];

    // Also remove from tournament's embedded matches
    const tournament = await getTournament(matchToDelete.tournamentId);
    if (tournament && tournament.matches) {
      tournament.matches = tournament.matches.filter(m => m.id !== matchId);
      await setTournament(tournament);
    }

    // Read current games
    const gamesData = await getGames();

    // Remove all games associated with this match
    const updatedGames = gamesData.filter((game: Game) => game.matchId !== matchId);

    // Remove the match
    matchesData.splice(matchIndex, 1);

    // Write updated data back
    await setMatches(matchesData);
    await setGames(updatedGames);

    return NextResponse.json({
      message: 'Match and associated games deleted successfully',
      deletedMatch: matchToDelete
    });

  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
