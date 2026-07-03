import { POST } from '../app/api/tournaments/[id]/refresh-matches/route';
import { Tournament } from '../types/pingpong';

jest.mock('../data/data', () => ({
  getTournament: jest.fn(),
  setTournament: jest.fn(),
  saveData: jest.fn(),
  registerMatchesIndex: jest.fn(),
  unregisterMatchesIndex: jest.fn(),
}));

jest.mock('../lib/tournament', () => ({
  resyncRoundRobinMatches: jest.fn(),
}));

import {
  getTournament,
  setTournament,
  saveData,
  registerMatchesIndex,
  unregisterMatchesIndex,
} from '../data/data';
import { resyncRoundRobinMatches } from '../lib/tournament';

const mockedGetTournament = getTournament as jest.MockedFunction<typeof getTournament>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;
const mockedRegisterMatchesIndex = registerMatchesIndex as jest.MockedFunction<typeof registerMatchesIndex>;
const mockedUnregisterMatchesIndex = unregisterMatchesIndex as jest.MockedFunction<typeof unregisterMatchesIndex>;
const mockedResync = resyncRoundRobinMatches as jest.MockedFunction<typeof resyncRoundRobinMatches>;

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'T1',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
    players: ['p1', 'p2', 'p3'],
    activePlayers: ['p1', 'p2', 'p3'],
    matches: [],
    ...overrides,
  };
}

function callRefresh(id = 't1') {
  const request = new Request('http://localhost/api/tournaments/t1/refresh-matches', { method: 'POST' });
  return POST(request as never, { params: Promise.resolve({ id }) });
}

describe('POST /api/tournaments/[id]/refresh-matches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResync.mockReturnValue({ matches: [], addedMatches: [], removedMatchIds: [] });
  });

  it('returns 404 when the tournament does not exist', async () => {
    mockedGetTournament.mockResolvedValue(null);
    const response = await callRefresh();
    expect(response.status).toBe(404);
    expect(mockedResync).not.toHaveBeenCalled();
  });

  it('rejects refreshing once the bracket has started', async () => {
    mockedGetTournament.mockResolvedValue(
      makeTournament({ status: 'bracket', bracketStartedAt: new Date().toISOString() })
    );
    const response = await callRefresh();
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/round robin stage/i);
    expect(mockedResync).not.toHaveBeenCalled();
  });

  it('rejects refreshing a completed tournament', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament({ status: 'completed' }));
    const response = await callRefresh();
    expect(response.status).toBe(400);
  });

  it('resyncs matches without touching the roster and persists the result', async () => {
    const tournament = makeTournament();
    mockedGetTournament.mockResolvedValue(tournament);
    const added = [{ id: 'm-new', tournamentId: 't1', player1Id: 'p1', player2Id: 'p2', round: 'roundRobin' as const, bracketRound: 1, bestOf: 1, games: [] }];
    mockedResync.mockReturnValue({ matches: added, addedMatches: added, removedMatchIds: ['m-old'] });

    const response = await callRefresh();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedResync).toHaveBeenCalledWith(tournament);
    expect(mockedUnregisterMatchesIndex).toHaveBeenCalledWith(['m-old']);
    expect(mockedRegisterMatchesIndex).toHaveBeenCalledWith(added);
    expect(mockedSetTournament).toHaveBeenCalledTimes(1);
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
    expect(body.matches).toEqual(added);
    // Roster fields are never touched by this endpoint
    expect(body.players).toEqual(tournament.players);
    expect(body.activePlayers).toEqual(tournament.activePlayers);
  });
});
