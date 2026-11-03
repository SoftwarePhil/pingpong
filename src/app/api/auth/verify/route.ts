import { NextRequest, NextResponse } from 'next/server';
import { consumeLoginLink, getAdminById, recordSignIn } from '../../../../data/admins';
import { setAdminSession } from '../../../../lib/auth';

/** Trades a sign-in link's token for a session cookie. Each token works once. */
export async function POST(request: NextRequest) {
  const { token } = await request.json().catch(() => ({}));
  if (typeof token !== 'string' || token.length === 0) {
    return NextResponse.json({ error: 'This sign-in link is not valid' }, { status: 400 });
  }
  try {
    const adminId = await consumeLoginLink(token);
    const admin = adminId ? await getAdminById(adminId) : null;
    if (!admin) {
      return NextResponse.json({ error: 'This sign-in link has expired or was already used. Request a new one.' }, { status: 401 });
    }
    await recordSignIn(admin.id);
    return setAdminSession(NextResponse.json({ role: 'admin' }), admin.id);
  } catch (error) {
    console.error('Error verifying sign-in link:', error);
    return NextResponse.json({ error: 'Could not sign you in. Try again.' }, { status: 500 });
  }
}
