import { PUT } from '../app/api/matches/[id]/route';
import { adminRequest } from './authTestUtils';
import { MARKER_PLAYER_ID, Match, Tournament } from '../types/pingpong';

jest.mock('../data/data', () => ({
  getMatch: jest.fn(),
  getTournamentIdForMatch: jest.fn(),
  getTournament: jest.fn(),
  setTournament: jest.fn(),
  updateMatchInTournament: jest.fn(),
  removeMatchFromTournament: jest.fn(),
  removeGamesFromHistory: jest.fn(),
  recalculateMatchWinner: jest.fn((match: Match) => match),
  saveData: jest.fn(),
}));

import { getMatch, getTournament, getTournamentIdForMatch, setTournament, updateMatchInTournament } from '../data/data';

const mockedGetMatch = getMatch as jest.MockedFunction<typeof getMatch>;
const mockedGetTournament = getTournament as jest.MockedFunction<typeof getTournament>;
const mockedGetTournamentIdForMatch = getTournamentIdForMatch as jest.MockedFunction<typeof getTournamentIdForMatch>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;
const mockedUpdateMatchInTournament = updateMatchInTournament as jest.MockedFunction<typeof updateMatchInTournament>;

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    tournamentId: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
    round: 'roundRobin',
    bracketRound: 1,
    bestOf: 1,
    games: [],
    ...overrides,
  };
}

function makeTournament(matches: Match[]): Tournament {
  return {
    id: 't1',
    name: 'T1',
    startDate: '2026-10-01T00:00:00.000Z',
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [],
    players: ['p1', 'p2', 'p3', 'p4', 'p5'],
    activePlayers: ['p1', 'p2', 'p3', 'p4'],
    matches,
  };
}

function put(body: unknown) {
  return PUT(
    adminRequest('http://localhost/api/matches/m1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'm1' }) },
  );
}

async function expectRejected(body: unknown, message: string) {
  const res = await put(body);
  expect(res.status).toBe(400);
  expect((await res.json()).error).toContain(message);
  expect(mockedSetTournament).not.toHaveBeenCalled();
  expect(mockedUpdateMatchInTournament).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  const matches = [makeMatch(), makeMatch({ id: 'm2', player1Id: 'p3', player2Id: 'p4' })];
  mockedGetMatch.mockResolvedValue(matches[0]);
  mockedGetTournamentIdForMatch.mockResolvedValue('t1');
  mockedGetTournament.mockResolvedValue(makeTournament(matches));
  mockedUpdateMatchInTournament.mockResolvedValue(makeTournament(matches));
});

describe('PUT /api/matches/:id', () => {
  it.each([
    [{ winnerId: 'p1' }, 'winnerId'],
    [{ games: [] }, 'games'],
    [{ id: 'other', round: 'bracket' }, 'id, round'],
    [{ tournamentId: 't2', bestOf: 3 }, 'tournamentId'],
  ])('refuses to change fields outside players and best-of: %j', async (body, fields) => {
    await expectRejected(body, `These match fields cannot be changed: ${fields}`);
  });

  it.each([0, 2, 1.5, '3', -1])('rejects best-of %p', async bestOf => {
    await expectRejected({ bestOf }, 'Best of must be an odd whole number');
  });

  it('rejects malformed player ids', async () => {
    await expectRejected({ player1Id: 42 }, 'Player ids must be non-empty strings');
    await expectRejected({ player1Id: '' }, 'Player ids must be non-empty strings');
  });

  it('requires exactly one kind of change per request', async () => {
    await expectRejected({}, 'Change either the players or the number of games');
    await expectRejected({ player1Id: 'p3', bestOf: 3 }, 'Change either the players or the number of games');
    await expectRejected(null, 'Invalid match update');
  });

  it('refuses players who are not active in the tournament', async () => {
    await expectRejected({ player1Id: 'stranger', player2Id: 'p2' }, 'Not an active player in this tournament: stranger');
    // p5 is on the roster but inactive today.
    await expectRejected({ player1Id: 'p5', player2Id: 'p2' }, 'Not an active player in this tournament: p5');
  });

  it('changes best-of', async () => {
    const res = await put({ bestOf: 3 });
    expect(res.status).toBe(200);
    expect(mockedUpdateMatchInTournament).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', bestOf: 3 }));
  });

  it('swaps in an active player and moves the displaced one', async () => {
    const res = await put({ player1Id: 'p3', player2Id: 'p2' });
    expect(res.status).toBe(200);
    const saved = mockedSetTournament.mock.calls[0][0].matches!;
    expect(saved.find(m => m.id === 'm1')).toMatchObject({ player1Id: 'p3', player2Id: 'p2' });
    expect(saved.find(m => m.id === 'm2')).toMatchObject({ player1Id: 'p1', player2Id: 'p4' });
  });

  it('still lets a marker join an unplayed round-robin bye', async () => {
    const bye = makeMatch({ player2Id: 'BYE', winnerId: 'p1' });
    mockedGetMatch.mockResolvedValue(bye);
    mockedGetTournament.mockResolvedValue(makeTournament([bye]));

    const res = await put({ player2Id: MARKER_PLAYER_ID });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated).toMatchObject({ player1Id: 'p1', player2Id: MARKER_PLAYER_ID });
    expect(updated).not.toHaveProperty('winnerId');
  });
});
