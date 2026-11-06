import { NextRequest, NextResponse } from 'next/server';
import { exportClubData } from '../../../data/data';
import { requireAdmin } from '../../../lib/auth';

/** Downloads the admin's club: its players, tournaments and games as one JSON file. */
export async function GET(request: NextRequest) {
  const { admin, denied } = await requireAdmin(request);
  if (denied) return denied;
  try {
    const data = await exportClubData(admin.clubId);
    const date = data.exportedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="pingpong-${data.environment}-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
