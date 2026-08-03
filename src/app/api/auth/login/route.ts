import { NextRequest, NextResponse } from 'next/server';
import { isValidAdminPassword, setAdminSession } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({}));
  if (!isValidAdminPassword(password)) {
    return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
  }
  return setAdminSession(NextResponse.json({ role: 'admin' }));
}
