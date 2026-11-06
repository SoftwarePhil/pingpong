import { POST } from '../app/api/tournaments/route';
import { adminRequest } from './authTestUtils';
import { Tournament } from '../types/pingpong';

jest.mock('../data/data', () => ({
  getPlayers: jest.fn(),
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

import { getPlayers, getTournaments, setTournament } from '../data/data';

const mockedGetPlayers = getPlayers as jest.MockedFunction<typeof getPlayers>;
const mockedGetTournaments = getTournaments as jest.MockedFunction<typeof getTournaments>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;

function activeTournament(overrides: Partial<Tournament>): Tournament {
  return {
    clubId: 'club-dallas',
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
  mockedGetPlayers.mockResolvedValue(['p1', 'p2', 'p3', 'p4'].map(id => ({ id, clubId: 'club-dallas', name: id, tournamentIds: [] })));
});

describe('POST /api/tournaments', () => {
  it('creates the tournament in the club', async () => {
    mockedGetTournaments.mockResolvedValue([]);

    const res = await create();

    expect(res.status).toBe(201);
    expect(mockedSetTournament.mock.calls[0][0]).toMatchObject({ clubId: 'club-dallas', name: 'Week 30' });
  });

  it('refuses while another tournament is running in the club', async () => {
    mockedGetTournaments.mockResolvedValue([activeTournament({})]);

    const res = await create();

    expect(res.status).toBe(409);
    expect(mockedGetTournaments).toHaveBeenCalledWith('club-dallas');
    expect(mockedSetTournament).not.toHaveBeenCalled();
  });

  it("refuses players from another club", async () => {
    mockedGetTournaments.mockResolvedValue([]);
    mockedGetPlayers.mockResolvedValue([{ id: 'p1', clubId: 'club-dallas', name: 'p1', tournamentIds: [] }]);

    const res = await create();

    expect(res.status).toBe(400);
    expect(mockedSetTournament).not.toHaveBeenCalled();
  });
});
