import { NextRequest, NextResponse } from 'next/server';
import { addAdmin, AdminExistsError, listAdmins } from '../../../data/admins';
import { requireOwner } from '../../../lib/auth';
import { AdminRole } from '../../../types/pingpong';

const ROLES: AdminRole[] = ['owner', 'admin'];

/** The admins of the owner's club. */
export async function GET(request: NextRequest) {
  const { owner, denied } = await requireOwner(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await listAdmins(owner.clubId));
  } catch (error) {
    console.error('Error listing admins:', error);
    return NextResponse.json({ error: 'Failed to load admins' }, { status: 500 });
  }
}

/** Adds an admin to the owner's club. They sign in with a link sent to this email. */
export async function POST(request: NextRequest) {
  const { owner, denied } = await requireOwner(request);
  if (denied) return denied;
  const { email, name, role = 'admin' } = await request.json().catch(() => ({}));
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Enter a name' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Role must be owner or admin' }, { status: 400 });
  }
  try {
    const admin = await addAdmin({ clubId: owner.clubId, email, name, role });
    return NextResponse.json(admin, { status: 201 });
  } catch (error) {
    if (error instanceof AdminExistsError) {
      return NextResponse.json({ error: 'Someone with that email is already an admin' }, { status: 409 });
    }
    console.error('Error adding admin:', error);
    return NextResponse.json({ error: 'Failed to add admin' }, { status: 500 });
  }
}
