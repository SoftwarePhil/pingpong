import { GET } from '../app/api/export/route';
import { adminRequest, playerRequest } from './authTestUtils';
import type { DataExport } from '../data/data';

jest.mock('../data/data', () => ({
  exportAllData: jest.fn(),
}));

import { exportAllData } from '../data/data';

const mockedExportAllData = exportAllData as jest.MockedFunction<typeof exportAllData>;

const sample: DataExport = {
  formatVersion: 1,
  exportedAt: '2026-10-26T15:30:00.000Z',
  environment: 'production',
  counts: { players: 1, tournaments: 1, activeTournaments: 0, games: 1 },
  players: [{ id: 'p1', name: 'Phil', tournamentIds: ['t1'] }],
  tournaments: [{
    id: 't1', name: 'Week 1', startDate: '2026-10-01T00:00:00.000Z', status: 'completed',
    roundRobinRounds: 1, rrBestOf: 1, bracketRounds: [], players: ['p1'], matches: [],
  }],
  games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 4, date: '2026-10-01T18:00:00.000Z' }],
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/export', () => {
  it('refuses viewers before reading any data', async () => {
    const res = await GET(playerRequest('http://localhost/api/export'));
    expect(res.status).toBe(403);
    expect(mockedExportAllData).not.toHaveBeenCalled();
  });

  it('downloads everything as a dated JSON file for admins', async () => {
    mockedExportAllData.mockResolvedValue(sample);

    const res = await GET(adminRequest('http://localhost/api/export'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="pingpong-production-2026-10-26.json"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual(sample);
  });

  it('fails instead of sending a partial file when a read fails', async () => {
    mockedExportAllData.mockRejectedValue(new Error('Mongo unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(adminRequest('http://localhost/api/export'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to export data' });
  });
});
