import { PUT } from '../app/api/tournaments/route';
import { adminRequest } from './authTestUtils';
import { Match, Tournament } from '../types/pingpong';

jest.mock('../data/data', () => ({
  getTournaments: jest.fn(),
  saveData: jest.fn(),
  setTournament: jest.fn(),
  getTournament: jest.fn(),
  deleteTournament: jest.fn(),
  registerMatchesIndex: jest.fn(),
  unregisterMatchesIndex: jest.fn(),
  syncTournamentPlayers: jest.fn(),
  setRoundRobinFormatAtomically: jest.fn(),
  TournamentConflictError: class extends Error {},
  TournamentNotFoundError: class extends Error {},
}));

import { getTournament, registerMatchesIndex, setTournament, unregisterMatchesIndex } from '../data/data';

const mockedGetTournament = getTournament as jest.MockedFunction<typeof getTournament>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;

function rrMatch(id: string, player1Id: string, player2Id: string): Match {
  return {
    id,
    tournamentId: 't1',
    player1Id,
    player2Id,
    round: 'roundRobin',
    bracketRound: 1,
    bestOf: 1,
    games: [{ id: `${id}-g`, matchId: id, player1Id, player2Id, score1: 11, score2: 5, date: '2026-10-01T00:00:00.000Z' }],
    winnerId: player1Id,
  };
}

function makeTournament(extraMatches: Match[] = []): Tournament {
  return {
    id: 't1',
    name: 'T1',
    startDate: '2026-10-01T00:00:00.000Z',
    status: 'roundRobin',
    roundRobinRounds: 1,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
    players: ['p1', 'p2', 'p3', 'p4'],
    activePlayers: ['p1', 'p2', 'p3', 'p4'],
    matches: [rrMatch('rr1', 'p1', 'p2'), rrMatch('rr2', 'p3', 'p4'), ...extraMatches],
  };
}

function startBracket(body: Record<string, unknown>) {
  return PUT(adminRequest('http://localhost/api/tournaments', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 't1', action: 'startBracket', ...body }),
  }));
}

const previewSlot = (player1Id: string, player2Id: string) => ({ id: `client-${player1Id}`, bracketRound: 1, player1Id, player2Id, round: 'bracket', games: [], bestOf: 1 });

beforeEach(() => jest.clearAllMocks());

describe('PUT /api/tournaments startBracket', () => {
  it('commits the previewed opening round, rebuilt with server ids and settings', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament());

    const res = await startBracket({
      initialBracketMatches: [previewSlot('p1', 'p4'), previewSlot('p3', 'p2')],
      bracketConfig: { playInMode: 'none', thirdPlaceMatch: true },
    });

    expect(res.status).toBe(200);
    const saved = mockedSetTournament.mock.calls[0][0];
    const bracket = saved.matches!.filter(m => m.round === 'bracket');
    expect(bracket.map(m => [m.player1Id, m.player2Id, m.bestOf])).toEqual([['p1', 'p4', 3], ['p3', 'p2', 3]]);
    expect(bracket.every(m => !m.id.startsWith('client-'))).toBe(true);
    expect(saved).toMatchObject({ status: 'bracket', bracketConfig: { playInMode: 'none', thirdPlaceMatch: true } });
    expect(saved.playerRanking).toHaveLength(4);
    expect(registerMatchesIndex).toHaveBeenCalledWith(bracket);
  });

  it('rejects an invalid preview without touching the existing bracket or index', async () => {
    const unplayedBracket: Match = { ...rrMatch('b1', 'p1', 'p2'), round: 'bracket', games: [], winnerId: undefined };
    mockedGetTournament.mockResolvedValue(makeTournament([unplayedBracket]));

    const res = await startBracket({ initialBracketMatches: [previewSlot('p1', 'p4'), previewSlot('p3', 'intruder')] });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Not an active player in this tournament: intruder');
    expect(unregisterMatchesIndex).not.toHaveBeenCalled();
    expect(registerMatchesIndex).not.toHaveBeenCalled();
    expect(mockedSetTournament).not.toHaveBeenCalled();
  });

  it('replaces an earlier unplayed bracket once the new one is valid', async () => {
    const unplayedBracket: Match = { ...rrMatch('b1', 'p1', 'p2'), round: 'bracket', games: [], winnerId: undefined };
    mockedGetTournament.mockResolvedValue(makeTournament([unplayedBracket]));

    const res = await startBracket({ initialBracketMatches: [previewSlot('p1', 'p4'), previewSlot('p3', 'p2')] });

    expect(res.status).toBe(200);
    expect(unregisterMatchesIndex).toHaveBeenCalledWith(['b1']);
    const saved = mockedSetTournament.mock.calls[0][0];
    expect(saved.matches!.some(m => m.id === 'b1')).toBe(false);
  });

  it.each([
    [{ playInMode: 'sideways' }, 'Invalid play-in mode'],
    [{ thirdPlaceMatch: 'yes' }, 'Invalid third-place setting'],
    ['force', 'Invalid bracket settings'],
  ])('rejects invalid bracket settings %j', async (bracketConfig, message) => {
    mockedGetTournament.mockResolvedValue(makeTournament());

    const res = await startBracket({ bracketConfig });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
    expect(mockedSetTournament).not.toHaveBeenCalled();
  });

  it('still generates the bracket when no preview is sent', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament());

    const res = await startBracket({});

    expect(res.status).toBe(200);
    const saved = mockedSetTournament.mock.calls[0][0];
    expect(saved.matches!.filter(m => m.round === 'bracket')).toHaveLength(2);
    expect(saved.playerRanking).toHaveLength(4);
  });
});
