import { PUT } from '../app/api/tournaments/route';
import { adminRequest } from './authTestUtils';

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

    const request = adminRequest('http://localhost/api/tournaments', {
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

    const request = adminRequest('http://localhost/api/tournaments', {
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

  it('ignores legacy players/activePlayers fields — roster edits now live on their own endpoint', async () => {
    // Adding/removing players is handled exclusively by
    // PATCH /api/tournaments/[id]/players now. The main PUT handler no longer
    // destructures `players`/`activePlayers` at all, so sending them here is a
    // no-op rather than an error — the request just falls through to whatever
    // other fields (status/action) were provided.
    const tournament = makeTournament({ status: 'roundRobin' });
    mockedGetTournament.mockResolvedValue(tournament);

    const request = adminRequest('http://localhost/api/tournaments', {
      method: 'PUT',
      body: JSON.stringify({ id: 't1', players: ['p1', 'p2', 'p3'], activePlayers: ['p1', 'p2', 'p3'] }),
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    // Roster is untouched by this endpoint
    expect(body.players).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(mockedSetTournament).toHaveBeenCalledTimes(1);
  });

  describe('advanceRound completeness check is scoped to the current round only', () => {
    // Regression: an incomplete/no-winner round-robin match left behind in an
    // EARLIER round (e.g. edited via the round picker in the UI) must never
    // block advancing an already-finished current round — the pre-fix check
    // scanned all rounds instead of just the current one.
    it('advances the current round even when an earlier round has an incomplete match', async () => {
      const tournament = makeTournament({
        matches: [
          // Round 1 — one match missing a winner (e.g. a score was edited/cleared)
          makeMatch({ id: 'rr1a', round: 'roundRobin', bracketRound: 1, winnerId: 'p1' }),
          makeMatch({ id: 'rr1b', round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p4' }), // no winnerId
          // Round 2 (current) — fully complete
          makeMatch({ id: 'rr2a', round: 'roundRobin', bracketRound: 2, winnerId: 'p1' }),
          makeMatch({ id: 'rr2b', round: 'roundRobin', bracketRound: 2, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
        ],
      });
      mockedGetTournament.mockResolvedValue(tournament);
      mockedAdvanceRoundRobinRound.mockReturnValue([makeMatch({ id: 'rr3', bracketRound: 3 })]);

      const request = adminRequest('http://localhost/api/tournaments', {
        method: 'PUT',
        body: JSON.stringify({ id: 't1', action: 'advanceRound' }),
      });
      const response = await PUT(request as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.error).toBeUndefined();
      expect(mockedAdvanceRoundRobinRound).toHaveBeenCalledTimes(1);
    });

    it('still blocks advancing when the actual current round has an incomplete match', async () => {
      const tournament = makeTournament({
        matches: [
          makeMatch({ id: 'rr1a', round: 'roundRobin', bracketRound: 1, winnerId: 'p1' }),
          makeMatch({ id: 'rr2a', round: 'roundRobin', bracketRound: 2, winnerId: 'p1' }),
          makeMatch({ id: 'rr2b', round: 'roundRobin', bracketRound: 2, player1Id: 'p3', player2Id: 'p4' }), // no winnerId — current round incomplete
        ],
      });
      mockedGetTournament.mockResolvedValue(tournament);

      const request = adminRequest('http://localhost/api/tournaments', {
        method: 'PUT',
        body: JSON.stringify({ id: 't1', action: 'advanceRound' }),
      });
      const response = await PUT(request as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/current round is not complete/i);
      expect(mockedAdvanceRoundRobinRound).not.toHaveBeenCalled();
    });
  });
});
