import { NextRequest, NextResponse } from 'next/server';
import { getAllMatches } from '../../../data/data';
import { clubFromRequest } from '../../../lib/clubRequest';

export async function GET(request: NextRequest) {
  try {
    const club = await clubFromRequest(request);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    return NextResponse.json(await getAllMatches(club.id));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read matches' }, { status: 500 });
  }
}
