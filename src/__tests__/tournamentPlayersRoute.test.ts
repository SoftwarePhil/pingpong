import { PATCH } from '../app/api/tournaments/[id]/players/route';
import { Tournament } from '../types/pingpong';
import { adminRequest } from './authTestUtils';

jest.mock('../data/data', () => ({
  getTournament: jest.fn(),
  setTournament: jest.fn(),
  saveData: jest.fn(),
  registerMatchesIndex: jest.fn(),
  unregisterMatchesIndex: jest.fn(),
  syncTournamentPlayers: jest.fn(),
  getPlayers: jest.fn(),
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
  syncTournamentPlayers,
  getPlayers,
} from '../data/data';
import { resyncRoundRobinMatches } from '../lib/tournament';

const mockedGetTournament = getTournament as jest.MockedFunction<typeof getTournament>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;
const mockedRegisterMatchesIndex = registerMatchesIndex as jest.MockedFunction<typeof registerMatchesIndex>;
const mockedUnregisterMatchesIndex = unregisterMatchesIndex as jest.MockedFunction<typeof unregisterMatchesIndex>;
const mockedSyncTournamentPlayers = syncTournamentPlayers as jest.MockedFunction<typeof syncTournamentPlayers>;
const mockedGetPlayers = getPlayers as jest.MockedFunction<typeof getPlayers>;
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

function makeRequest(body: unknown) {
  return adminRequest('http://localhost/api/tournaments/t1/players', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function callPatch(body: unknown, id = 't1') {
  return PATCH(makeRequest(body) as never, { params: Promise.resolve({ id }) });
}

describe('PATCH /api/tournaments/[id]/players', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetPlayers.mockResolvedValue([
      { id: 'p1', name: 'P1', tournamentIds: [] },
      { id: 'p2', name: 'P2', tournamentIds: [] },
      { id: 'p3', name: 'P3', tournamentIds: [] },
      { id: 'p4', name: 'P4', tournamentIds: [] },
    ]);
    mockedResync.mockReturnValue({ matches: [], addedMatches: [], removedMatchIds: [] });
  });

  it('rejects a request with neither add nor remove', async () => {
    const response = await callPatch({});
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/add.*remove/i);
    expect(mockedGetTournament).not.toHaveBeenCalled();
  });

  it('rejects a player id present in both add and remove', async () => {
    const response = await callPatch({ add: ['p4'], remove: ['p4'] });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/p4/);
  });

  it('returns 404 when the tournament does not exist', async () => {
    mockedGetTournament.mockResolvedValue(null);
    const response = await callPatch({ add: ['p4'] });
    expect(response.status).toBe(404);
  });

  it('rejects edits once the bracket has started', async () => {
    mockedGetTournament.mockResolvedValue(
      makeTournament({ status: 'bracket', bracketStartedAt: new Date().toISOString() })
    );
    const response = await callPatch({ remove: ['p1'] });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/bracket has started/i);
    expect(mockedResync).not.toHaveBeenCalled();
  });

  it('rejects edits once the tournament is completed', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament({ status: 'completed' }));
    const response = await callPatch({ remove: ['p1'] });
    expect(response.status).toBe(400);
  });

  it('rejects adding an unknown player id', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament());
    const response = await callPatch({ add: ['ghost'] });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/unknown player/i);
    expect(mockedSetTournament).not.toHaveBeenCalled();
  });

  it('adds a new player to both the roster and active players, then resyncs matches', async () => {
    const tournament = makeTournament();
    mockedGetTournament.mockResolvedValue(tournament);
    mockedResync.mockReturnValue({
      matches: [{ id: 'new1', tournamentId: 't1', player1Id: 'p4', player2Id: 'BYE', round: 'roundRobin', bracketRound: 1, bestOf: 1, games: [], winnerId: 'p4' }],
      addedMatches: [{ id: 'new1', tournamentId: 't1', player1Id: 'p4', player2Id: 'BYE', round: 'roundRobin', bracketRound: 1, bestOf: 1, games: [], winnerId: 'p4' }],
      removedMatchIds: [],
    });

    const response = await callPatch({ add: ['p4'] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.players).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(body.activePlayers).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(mockedResync).toHaveBeenCalledTimes(1);
    expect(mockedRegisterMatchesIndex).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'new1' }),
    ]);
    expect(mockedUnregisterMatchesIndex).toHaveBeenCalledWith([]);
    expect(mockedSyncTournamentPlayers).toHaveBeenCalledTimes(1);
    expect(mockedSetTournament).toHaveBeenCalledTimes(1);
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
  });

  it('deactivates a removed player without deleting them from the permanent roster', async () => {
    const tournament = makeTournament();
    mockedGetTournament.mockResolvedValue(tournament);

    const response = await callPatch({ remove: ['p2'] });
    const body = await response.json();

    expect(response.status).toBe(200);
    // Master roster is unchanged — kept for historical accuracy
    expect(body.players).toEqual(['p1', 'p2', 'p3']);
    // Only activePlayers drops the removed id
    expect(body.activePlayers).toEqual(['p1', 'p3']);
    expect(mockedResync).toHaveBeenCalledTimes(1);
  });

  it('supports add and remove together in a single atomic request', async () => {
    const tournament = makeTournament();
    mockedGetTournament.mockResolvedValue(tournament);

    const response = await callPatch({ add: ['p4'], remove: ['p2'] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.players).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(body.activePlayers.sort()).toEqual(['p1', 'p3', 'p4']);
    expect(mockedResync).toHaveBeenCalledTimes(1);
  });

  it('does not resync matches when the tournament is not in the round robin stage', async () => {
    // Defensive-in-depth check: even though the bracket-started guard above
    // already blocks 'bracket'/'completed', resync is only ever invoked for
    // 'roundRobin' tournaments.
    const tournament = makeTournament({ status: 'roundRobin' });
    mockedGetTournament.mockResolvedValue(tournament);
    await callPatch({ add: ['p4'] });
    expect(mockedResync).toHaveBeenCalledTimes(1);
  });
});
