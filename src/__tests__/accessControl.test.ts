import { GET as getTournamentsRoute, POST as createTournament } from '../app/api/tournaments/route';
import { Tournament } from '../types/pingpong';
import { playerRequest } from './authTestUtils';

jest.mock('../data/data', () => ({
  getTournaments: jest.fn(),
}));

import { getTournaments } from '../data/data';

const mockedGetTournaments = getTournaments as jest.MockedFunction<typeof getTournaments>;

function makeTournament(): Tournament {
  return {
    id: 't1',
    name: 'Current tournament',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
    players: ['p1', 'p2'],
    matches: [{
      id: 'm1',
      tournamentId: 't1',
      player1Id: 'p1',
      player2Id: 'p2',
      round: 'roundRobin',
      bracketRound: 1,
      bestOf: 1,
      games: [],
    }],
  };
}

describe('player/admin access boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows unauthenticated players to read round-robin matches', async () => {
    mockedGetTournaments.mockResolvedValue([makeTournament()]);

    const response = await getTournamentsRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0].matches).toEqual([
      expect.objectContaining({ round: 'roundRobin', player1Id: 'p1', player2Id: 'p2' }),
    ]);
  });

  it('rejects unauthenticated tournament mutations before reading data', async () => {
    const response = await createTournament(playerRequest('http://localhost/api/tournaments', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Admin access required' });
    expect(mockedGetTournaments).not.toHaveBeenCalled();
  });
});
