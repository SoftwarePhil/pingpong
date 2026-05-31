import { PUT } from '../app/api/tournaments/route';

jest.mock('../data/data', () => ({
  getTournaments: jest.fn(),
  saveData: jest.fn(),
  setTournament: jest.fn(),
  getTournament: jest.fn(),
  deleteTournament: jest.fn(),
  registerMatchesIndex: jest.fn(),
  unregisterMatchesIndex: jest.fn(),
  syncTournamentPlayers: jest.fn(),
}));

jest.mock('../lib/tournament', () => ({
  createRoundRobinPairings: jest.fn(),
  advanceBracketRound: jest.fn(),
  createBracketMatches: jest.fn(),
  advanceRoundRobinRound: jest.fn(),
}));

import {
  getTournament,
  setTournament,
  saveData,
  registerMatchesIndex,
} from '../data/data';
import { advanceRoundRobinRound, createBracketMatches } from '../lib/tournament';
import { Tournament, Match } from '../types/pingpong';

const mockedGetTournament = getTournament as jest.MockedFunction<typeof getTournament>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;
const mockedRegisterMatchesIndex = registerMatchesIndex as jest.MockedFunction<typeof registerMatchesIndex>;
const mockedAdvanceRoundRobinRound = advanceRoundRobinRound as jest.MockedFunction<typeof advanceRoundRobinRound>;
const mockedCreateBracketMatches = createBracketMatches as jest.MockedFunction<typeof createBracketMatches>;

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'T1',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
    players: ['p1', 'p2', 'p3', 'p4'],
    activePlayers: ['p1', 'p2', 'p3', 'p4'],
    matches: [],
    ...overrides,
  };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    tournamentId: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
    round: 'roundRobin',
    bracketRound: 2,
    bestOf: 1,
    games: [],
    ...overrides,
  };
}

describe('tournaments route transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows adding round robin rounds before bracket starts', async () => {
    const tournament = makeTournament({
      matches: [makeMatch({ id: 'rr1', round: 'roundRobin', bracketRound: 1 })],
    });
    mockedGetTournament.mockResolvedValue(tournament);
    mockedAdvanceRoundRobinRound.mockReturnValue([makeMatch({ id: 'rr2' })]);

    const request = new Request('http://localhost/api/tournaments', {
      method: 'PUT',
      body: JSON.stringify({ id: 't1', action: 'addRoundRobinRound' }),
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.roundRobinRounds).toBe(3);
    expect(mockedRegisterMatchesIndex).toHaveBeenCalledTimes(1);
    expect(mockedSetTournament).toHaveBeenCalledTimes(1);
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
  });

  it('starts bracket explicitly via action and stamps lifecycle', async () => {
    const tournament = makeTournament({
      matches: [makeMatch({ id: 'rr1', round: 'roundRobin', bracketRound: 1, winnerId: 'p1' })],
    });
    mockedGetTournament.mockResolvedValue(tournament);
    mockedCreateBracketMatches.mockReturnValue([
      makeMatch({ id: 'b1', round: 'bracket', bracketRound: 1, bestOf: 3 }),
    ]);

    const request = new Request('http://localhost/api/tournaments', {
      method: 'PUT',
      body: JSON.stringify({ id: 't1', action: 'startBracket' }),
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('bracket');
    expect(body.bracketStartedAt).toBeTruthy();
    expect(mockedCreateBracketMatches).toHaveBeenCalledTimes(1);
    expect(mockedRegisterMatchesIndex).toHaveBeenCalledTimes(1);
  });

  it('rejects roster edits after bracket has started', async () => {
    mockedGetTournament.mockResolvedValue(
      makeTournament({
        status: 'bracket',
        bracketStartedAt: new Date().toISOString(),
        matches: [makeMatch({ id: 'b1', round: 'bracket', bracketRound: 1 })],
      })
    );

    const request = new Request('http://localhost/api/tournaments', {
      method: 'PUT',
      body: JSON.stringify({ id: 't1', players: ['p1', 'p2', 'p3'] }),
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/after bracket has started/i);
  });
});
