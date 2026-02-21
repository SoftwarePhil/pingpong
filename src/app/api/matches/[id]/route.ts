import { NextRequest, NextResponse } from 'next/server';
import { Match } from '../../../../types/pingpong';
import { getMatch, updateMatchInTournament, removeMatchFromTournament } from '../../../../data/data';

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
