import { recalculateMatchWinner } from '../data/data';
import { Match, Game } from '../types/pingpong';

// Mock both Redis and MongoDB so data.ts doesn't attempt to connect on import
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    zRange: jest.fn().mockResolvedValue([]),
    zAdd: jest.fn().mockResolvedValue(1),
    zRem: jest.fn().mockResolvedValue(1),
    hGet: jest.fn().mockResolvedValue(null),
    hSet: jest.fn().mockResolvedValue(1),
    hDel: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  })),
}));

jest.mock('mongodb', () => ({
  MongoClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue([]),
        }),
        findOne: jest.fn().mockResolvedValue(null),
        replaceOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
        bulkWrite: jest.fn().mockResolvedValue({}),
      }),
    }),
  })),
}));

function makeGame(id: string, score1: number, score2: number, matchId = 'm1'): Game {
  return { id, matchId, player1Id: 'p1', player2Id: 'p2', score1, score2, date: new Date().toISOString() };
}

function makeMatch(bestOf: number, games: Game[]): Match {
  return {
    id: 'm1',
    tournamentId: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
    round: 'bracket',
    bestOf,
    games,
  };
}

describe('recalculateMatchWinner', () => {
  describe('best-of-1', () => {
    it('sets player1 as winner when p1 wins the single game', () => {
      const match = makeMatch(1, [makeGame('g1', 11, 5)]);
      expect(recalculateMatchWinner(match).winnerId).toBe('p1');
    });

    it('sets player2 as winner when p2 wins the single game', () => {
      const match = makeMatch(1, [makeGame('g1', 3, 11)]);
      expect(recalculateMatchWinner(match).winnerId).toBe('p2');
    });

    it('returns no winner when no games have been played', () => {
      const match = makeMatch(1, []);
      expect(recalculateMatchWinner(match).winnerId).toBeUndefined();
    });
  });

  describe('best-of-3', () => {
    it('sets player1 as winner after 2-0', () => {
      const match = makeMatch(3, [
        makeGame('g1', 11, 5),
        makeGame('g2', 11, 8),
      ]);
      expect(recalculateMatchWinner(match).winnerId).toBe('p1');
    });

    it('sets player2 as winner after 0-2', () => {
      const match = makeMatch(3, [
        makeGame('g1', 5, 11),
        makeGame('g2', 7, 11),
      ]);
      expect(recalculateMatchWinner(match).winnerId).toBe('p2');
    });

    it('sets player1 as winner after 2-1', () => {
      const match = makeMatch(3, [
        makeGame('g1', 11, 5),
        makeGame('g2', 5, 11),
        makeGame('g3', 11, 9),
      ]);
      expect(recalculateMatchWinner(match).winnerId).toBe('p1');
    });

    it('returns no winner when series is 1-1 (incomplete)', () => {
      const match = makeMatch(3, [
        makeGame('g1', 11, 5),
        makeGame('g2', 5, 11),
      ]);
      expect(recalculateMatchWinner(match).winnerId).toBeUndefined();
    });

    it('returns no winner when no games played', () => {
      const match = makeMatch(3, []);
      expect(recalculateMatchWinner(match).winnerId).toBeUndefined();
    });
  });

  describe('best-of-5', () => {
    it('sets player1 as winner after 3-0', () => {
      const match = makeMatch(5, [
        makeGame('g1', 11, 5),
        makeGame('g2', 11, 5),
        makeGame('g3', 11, 5),
      ]);
      expect(recalculateMatchWinner(match).winnerId).toBe('p1');
    });

    it('sets player2 as winner after 3-2', () => {
      const match = makeMatch(5, [
        makeGame('g1', 11, 5),
        makeGame('g2', 5, 11),
        makeGame('g3', 5, 11),
        makeGame('g4', 11, 8),
        makeGame('g5', 7, 11),
      ]);
      expect(recalculateMatchWinner(match).winnerId).toBe('p2');
    });

    it('returns no winner when series is 2-2 (incomplete)', () => {
      const match = makeMatch(5, [
        makeGame('g1', 11, 5),
        makeGame('g2', 5, 11),
        makeGame('g3', 11, 5),
        makeGame('g4', 5, 11),
      ]);
      expect(recalculateMatchWinner(match).winnerId).toBeUndefined();
    });
  });

  it('does not mutate the original match object', () => {
    const match = makeMatch(1, [makeGame('g1', 11, 5)]);
    const originalWinnerId = match.winnerId;
    recalculateMatchWinner(match);
    expect(match.winnerId).toBe(originalWinnerId);
  });
});
