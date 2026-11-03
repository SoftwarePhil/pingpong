import { NextRequest, NextResponse } from 'next/server';
import { getSessionAdmin } from '../../../../lib/auth';

export async function GET(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin) return NextResponse.json({ role: 'player', admin: null });
  const { id, name, email, role, clubId } = admin;
  return NextResponse.json({ role: 'admin', admin: { id, name, email, role, clubId } });
}
