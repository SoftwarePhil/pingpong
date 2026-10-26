import { POST } from '../app/api/tournaments/route';
import { adminRequest } from './authTestUtils';
import { Tournament } from '../types/pingpong';

jest.mock('../data/data', () => ({
  getDefaultClub: jest.fn(),
  getTournaments: jest.fn(),
  setTournament: jest.fn(),
  syncTournamentPlayers: jest.fn(),
  registerMatchesIndex: jest.fn(),
  getTournament: jest.fn(),
  deleteTournament: jest.fn(),
  unregisterMatchesIndex: jest.fn(),
  setRoundRobinFormatAtomically: jest.fn(),
  TournamentConflictError: class extends Error {},
  TournamentNotFoundError: class extends Error {},
}));

import { getDefaultClub, getTournaments, setTournament } from '../data/data';

const mockedGetDefaultClub = getDefaultClub as jest.MockedFunction<typeof getDefaultClub>;
const mockedGetTournaments = getTournaments as jest.MockedFunction<typeof getTournaments>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;

function activeTournament(overrides: Partial<Tournament>): Tournament {
  return {
    id: 'running', name: 'Running', startDate: '2026-10-01T00:00:00.000Z', status: 'roundRobin',
    roundRobinRounds: 1, rrBestOf: 1, bracketRounds: [], players: ['p1', 'p2'], matches: [],
    ...overrides,
  };
}

function create() {
  return POST(adminRequest('http://localhost/api/tournaments', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Week 30', roundRobinRounds: 2, rrBestOf: 1, players: ['p1', 'p2', 'p3', 'p4'],
      bracketRounds: [{ matchCount: 2, bestOf: 1 }, { matchCount: 1, bestOf: 3 }],
    }),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetDefaultClub.mockResolvedValue({ id: 'club-dallas', name: 'dallas', slug: 'dallas', createdAt: '2026-01-01T00:00:00.000Z' });
});

describe('POST /api/tournaments', () => {
  it('creates the tournament in the club', async () => {
    mockedGetTournaments.mockResolvedValue([]);

    const res = await create();

    expect(res.status).toBe(201);
    expect(mockedSetTournament.mock.calls[0][0]).toMatchObject({ clubId: 'club-dallas', name: 'Week 30' });
  });

  it.each([
    ['in the same club', { clubId: 'club-dallas' }],
    ['from before clubs existed (no clubId)', {}],
  ])('refuses while another tournament is running %s', async (_label, overrides) => {
    mockedGetTournaments.mockResolvedValue([activeTournament(overrides)]);

    const res = await create();

    expect(res.status).toBe(409);
    expect(mockedSetTournament).not.toHaveBeenCalled();
  });

  it("doesn't let another club's running tournament block this club", async () => {
    mockedGetTournaments.mockResolvedValue([activeTournament({ clubId: 'club-austin' })]);

    const res = await create();

    expect(res.status).toBe(201);
  });
});
