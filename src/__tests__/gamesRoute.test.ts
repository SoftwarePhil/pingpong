import { POST } from '../app/api/games/route';
import { PUT } from '../app/api/games/[id]/route';
import { adminRequest } from './authTestUtils';

jest.mock('../data/data', () => ({
  getAllGames: jest.fn(),
  addGameToMatch: jest.fn(),
  setTournament: jest.fn(),
  getMatch: jest.fn(),
  getTournament: jest.fn(),
  updateGameInMatch: jest.fn(),
  removeGameFromMatch: jest.fn(),
}));

import { addGameToMatch, getAllGames, getMatch, updateGameInMatch } from '../data/data';

function post(body: unknown) {
  return POST(adminRequest('http://localhost/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/games', () => {
  it('requires a match: games outside a tournament are not stored', async () => {
    const res = await post({ player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5 });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('matchId, score1 and score2 are required');
    expect(getMatch).not.toHaveBeenCalled();
    expect(addGameToMatch).not.toHaveBeenCalled();
  });

  it.each([
    [{ matchId: 'm1', score1: 11, score2: 10 }, 'Game must be won by 2 points'],
    [{ matchId: 'm1', score1: '11', score2: 5 }, 'Scores must be whole numbers of 0 or more'],
  ])('rejects an invalid score before touching the match: %j', async (body, message) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
    expect(getMatch).not.toHaveBeenCalled();
  });
});

describe('PUT /api/games/:id', () => {
  function put(body: unknown) {
    return PUT(
      adminRequest('http://localhost/api/games/g1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: 'g1' }) },
    );
  }

  beforeEach(() => {
    (getAllGames as jest.Mock).mockResolvedValue([
      { id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '2026-10-01T00:00:00.000Z' },
    ]);
  });

  it('checks the resulting score when only one side is edited', async () => {
    const res = await put({ score2: 10 });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Game must be won by 2 points');
    expect(updateGameInMatch).not.toHaveBeenCalled();
  });

  it('rejects a score that is not a whole number', async () => {
    const res = await put({ score1: 'eleven', score2: 5 });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Scores must be whole numbers of 0 or more');
  });
});
