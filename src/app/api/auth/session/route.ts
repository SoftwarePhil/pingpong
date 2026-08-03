import { NextRequest, NextResponse } from 'next/server';
import { getRole } from '../../../../lib/auth';

export async function GET(request: NextRequest) {
  return NextResponse.json({ role: getRole(request) });
}
