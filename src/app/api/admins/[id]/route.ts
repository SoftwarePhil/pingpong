import { NextRequest, NextResponse } from 'next/server';
import { LastOwnerError, removeAdmin } from '../../../../data/admins';
import { requireOwner } from '../../../../lib/auth';

/** Removes an admin from the owner's club. Their sessions stop working at once. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { owner, denied } = await requireOwner(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    if (!await removeAdmin(owner.clubId, id)) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }
    return NextResponse.json({ removed: true });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return NextResponse.json({ error: 'A club needs at least one owner. Add another owner first.' }, { status: 409 });
    }
    console.error('Error removing admin:', error);
    return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 });
  }
}
