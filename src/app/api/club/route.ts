import { NextRequest, NextResponse } from 'next/server';
import { updateClub } from '../../../data/data';
import { requireAdmin } from '../../../lib/auth';
import { CLUB_ABOUT_MAX, CLUB_NAME_MAX } from '../../../lib/clubs';

/** Updates the name and about text of the signed-in admin's club. */
export async function PATCH(request: NextRequest) {
  const { admin, denied } = await requireAdmin(request);
  if (denied) return denied;
  const { name, about } = await request.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim() || name.trim().length > CLUB_NAME_MAX) {
    return NextResponse.json({ error: `Enter a club name of up to ${CLUB_NAME_MAX} characters` }, { status: 400 });
  }
  if (typeof about !== 'string' || about.trim().length > CLUB_ABOUT_MAX) {
    return NextResponse.json({ error: `About text can be up to ${CLUB_ABOUT_MAX} characters` }, { status: 400 });
  }
  try {
    const club = await updateClub(admin.clubId, { name: name.trim(), about: about.trim() });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    return NextResponse.json(club);
  } catch (error) {
    console.error('Error updating club:', error);
    return NextResponse.json({ error: 'Failed to update club' }, { status: 500 });
  }
}
