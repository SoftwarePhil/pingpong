import { NextRequest } from 'next/server';
import { GET as getPlayersRoute } from '../app/api/players/route';
import { PATCH as patchClub } from '../app/api/club/route';
import { DELETE as deleteTournamentRoute, PUT as putTournament } from '../app/api/tournaments/route';
import { PATCH as patchTournamentPlayers } from '../app/api/tournaments/[id]/players/route';
import { POST as refreshMatches } from '../app/api/tournaments/[id]/refresh-matches/route';
import { DELETE as deleteMatch, PUT as putMatch } from '../app/api/matches/[id]/route';
import { POST as postGame } from '../app/api/games/route';
import { DELETE as deleteGame, PUT as putGame } from '../app/api/games/[id]/route';
import { countActivePlayers } from '../lib/stats';
import { Game, Match, Tournament } from '../types/pingpong';
import { adminRequest, playerRequest } from './authTestUtils';

jest.mock('../data/data', () => ({
  getClubBySlug: jest.fn(),
  updateClub: jest.fn(),
  getPlayers: jest.fn(),
  setPlayers: jest.fn(),
  getTournament: jest.fn(),
  getTournaments: jest.fn(),
  deleteTournament: jest.fn(),
  setTournament: jest.fn(),
  setRoundRobinFormatAtomically: jest.fn(),
  getMatch: jest.fn(),
  removeMatchFromTournament: jest.fn(),
  getTournamentIdForMatch: jest.fn(),
  getAllGames: jest.fn(),
  addGameToMatch: jest.fn(),
  updateGameInMatch: jest.fn(),
  removeGameFromMatch: jest.fn(),
  TournamentConflictError: class extends Error {},
  TournamentNotFoundError: class extends Error {},
}));

import * as data from '../data/data';

const mocked = data as jest.Mocked<typeof data>;

// The admin in authTestUtils belongs to club-dallas; these records don't.
const match: Match = {
  id: 'm1', tournamentId: 't1', player1Id: 'p1', player2Id: 'p2', round: 'roundRobin', bracketRound: 1, bestOf: 1, games: [],
};
const otherClubTournament: Tournament = {
  id: 't1', clubId: 'club-demo', name: 'Demo', startDate: '2026-10-01T00:00:00.000Z', status: 'roundRobin',
  roundRobinRounds: 1, rrBestOf: 1, bracketRounds: [], players: ['p1', 'p2'], matches: [match],
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getTournament.mockResolvedValue(otherClubTournament);
  mocked.getMatch.mockResolvedValue(match);
  mocked.getAllGames.mockResolvedValue([]);
});

describe('reads', () => {
  it('returns only the requested club', async () => {
    mocked.getClubBySlug.mockResolvedValue({ id: 'club-demo', name: 'Demo', slug: 'demo', createdAt: '2026-01-01T00:00:00.000Z' });
    mocked.getPlayers.mockResolvedValue([]);

    const res = await getPlayersRoute(playerRequest('http://localhost/api/players?club=demo'));

    expect(res.status).toBe(200);
    expect(mocked.getClubBySlug).toHaveBeenCalledWith('demo');
    expect(mocked.getPlayers).toHaveBeenCalledWith('club-demo');
  });

  it.each(['http://localhost/api/players', 'http://localhost/api/players?club=nope'])('404s for %s', async url => {
    mocked.getClubBySlug.mockResolvedValue(null);

    const res = await getPlayersRoute(playerRequest(url));

    expect(res.status).toBe(404);
    expect(mocked.getPlayers).not.toHaveBeenCalled();
  });
});

describe("an admin can't change another club", () => {
  const cases: [string, () => Promise<Response>][] = [
    ['advance its tournament', () => putTournament(adminRequest('http://localhost/api/tournaments', { method: 'PUT', body: JSON.stringify({ id: 't1', action: 'advanceRound' }) }))],
    ['change its round format', () => putTournament(adminRequest('http://localhost/api/tournaments', { method: 'PUT', body: JSON.stringify({ id: 't1', action: 'setRoundRobinFormat', round: 1, format: 'doubles' }) }))],
    ['delete its tournament', () => deleteTournamentRoute(adminRequest('http://localhost/api/tournaments?id=t1', { method: 'DELETE' }))],
    ['edit its roster', () => patchTournamentPlayers(adminRequest('http://localhost/api/tournaments/t1/players', json({ remove: ['p1'] })), params('t1'))],
    ['refresh its matches', () => refreshMatches(adminRequest('http://localhost/api/tournaments/t1/refresh-matches', { method: 'POST' }), params('t1'))],
    ['edit its match', () => putMatch(adminRequest('http://localhost/api/matches/m1', { method: 'PUT', body: JSON.stringify({ bestOf: 3 }) }), params('m1'))],
    ['delete its match', () => deleteMatch(adminRequest('http://localhost/api/matches/m1', { method: 'DELETE' }), params('m1'))],
    ['record a game', () => postGame(adminRequest('http://localhost/api/games', { method: 'POST', body: JSON.stringify({ matchId: 'm1', score1: 11, score2: 5 }) }))],
    ['edit a game', () => putGame(adminRequest('http://localhost/api/games/g1', { method: 'PUT', body: JSON.stringify({ score1: 11, score2: 7 }) }), params('g1'))],
    ['delete a game', () => deleteGame(adminRequest('http://localhost/api/games/g1', { method: 'DELETE' }), params('g1'))],
  ];

  it.each(cases)('%s', async (_label, call) => {
    const res = await call();

    expect(res.status).toBe(404);
    expect(mocked.setTournament).not.toHaveBeenCalled();
    expect(mocked.setRoundRobinFormatAtomically).not.toHaveBeenCalled();
    expect(mocked.deleteTournament).not.toHaveBeenCalled();
    expect(mocked.removeMatchFromTournament).not.toHaveBeenCalled();
    expect(mocked.addGameToMatch).not.toHaveBeenCalled();
    expect(mocked.updateGameInMatch).not.toHaveBeenCalled();
    expect(mocked.removeGameFromMatch).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/club', () => {
  const patch = (body: unknown, request: (url: string, init: { method: string; body: string }) => NextRequest = adminRequest) =>
    patchClub(request('http://localhost/api/club', json(body)));

  it("updates the admin's own club, trimmed", async () => {
    mocked.updateClub.mockResolvedValue({ id: 'club-dallas', name: 'Dallas', slug: 'dallas', about: 'Hi', createdAt: '2026-01-01T00:00:00.000Z' });

    const res = await patch({ name: ' Dallas ', about: ' Hi ', slug: 'stolen', id: 'club-demo' });

    expect(res.status).toBe(200);
    expect(mocked.updateClub).toHaveBeenCalledWith('club-dallas', { name: 'Dallas', about: 'Hi' });
  });

  it('refuses visitors', async () => {
    expect((await patch({ name: 'x', about: '' }, playerRequest)).status).toBe(403);
    expect(mocked.updateClub).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: '  ', about: '' }],
    [{ name: 'x'.repeat(61), about: '' }],
    [{ name: 'Dallas', about: 'x'.repeat(2001) }],
    [{ name: 'Dallas' }],
  ])('rejects %j', async body => {
    expect((await patch(body)).status).toBe(400);
    expect(mocked.updateClub).not.toHaveBeenCalled();
  });
});

describe('countActivePlayers', () => {
  const now = Date.parse('2026-11-06T00:00:00.000Z');
  const game = (overrides: Partial<Game>): Game => ({
    id: 'g', clubId: 'c', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '2026-11-01T00:00:00.000Z', ...overrides,
  });

  it('counts each player once, inside the window, without byes or markers', () => {
    const games = [
      game({}),
      game({ player1Id: 'p2', player2Id: 'MARKER' }),
      game({ player1Id: 'old', player2Id: 'older', date: '2026-01-01T00:00:00.000Z' }),
      game({ player1Id: 'p3', player2Id: 'p4', side1PlayerIds: ['p3', 'p5'], side2PlayerIds: ['p4', 'p6'] }),
    ];
    expect(countActivePlayers(games, 90, now)).toBe(6);
  });
});
