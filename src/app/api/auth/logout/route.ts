import { NextResponse } from 'next/server';
import { clearAdminSession } from '../../../../lib/auth';

export async function POST() {
  return clearAdminSession(NextResponse.json({ role: 'player' }));
}
