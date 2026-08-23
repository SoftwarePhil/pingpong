import { POST as postGame } from '../app/api/games/route';
import { DELETE as deleteGame, PUT as updateGame } from '../app/api/games/[id]/route';
import {
  getAllGames,
  getMatch,
  registerMatchesIndex,
  setTournament,
  setRoundRobinFormatAtomically,
  TournamentConflictError,
} from '../data/data';
import { createRoundRobinPairings } from '../lib/tournament';
import { Match, Tournament } from '../types/pingpong';
import { adminRequest } from './authTestUtils';

type StoredDocument = Record<string, unknown>;

const mockRedisStrings = new Map<string, string>();
const mockRedisHashes = new Map<string, Map<string, string>>();
const mockRedisSortedSets = new Map<string, Map<string, number>>();
const mockMongoGames = new Map<string, StoredDocument>();
const mockMongoTournaments = new Map<string, StoredDocument>();
const mockTransactionCommands: string[][] = [];
const mockWatchedKeys: (string | string[])[] = [];
let mockAbortNextTransaction = false;

type WatchErrorConstructor = new (message?: string) => Error;

type MockRedisTransaction = {
  set: jest.Mock<MockRedisTransaction, [string, string]>;
  zAdd: jest.Mock<MockRedisTransaction, [string, { score: number; value: string }]>;
  hDel: jest.Mock<MockRedisTransaction, [string, string | string[]]>;
  hSet: jest.Mock<MockRedisTransaction, [string, Record<string, string>]>;
  exec: jest.Mock<Promise<unknown[]>, []>;
};

type MockRedisClient = {
  on: jest.Mock;
  connect: jest.Mock<Promise<void>, []>;
  get: jest.Mock<Promise<string | null>, [string]>;
  set: jest.Mock<Promise<string>, [string, string]>;
  zRange: jest.Mock<Promise<string[]>, [string, number, number]>;
  zAdd: jest.Mock<Promise<number>, [string, { score: number; value: string }]>;
  zRem: jest.Mock<Promise<number>, [string, string]>;
  hGet: jest.Mock<Promise<string | null>, [string, string]>;
  hSet: jest.Mock<Promise<number>, [string, string | Record<string, string>, (string | undefined)?]>;
  hDel: jest.Mock<Promise<number>, [string, string | string[]]>;
  duplicate: jest.Mock<MockRedisClient, []>;
  watch: jest.Mock<Promise<string>, [string | string[]]>;
  unwatch: jest.Mock<Promise<string>, []>;
  quit: jest.Mock<Promise<string>, []>;
  multi: jest.Mock<MockRedisTransaction, []>;
  del: jest.Mock<Promise<number>, [string]>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hashFor(key: string): Map<string, string> {
  let hash = mockRedisHashes.get(key);
  if (!hash) {
    hash = new Map();
    mockRedisHashes.set(key, hash);
  }
  return hash;
}

function sortedSetFor(key: string): Map<string, number> {
  let sortedSet = mockRedisSortedSets.get(key);
  if (!sortedSet) {
    sortedSet = new Map();
    mockRedisSortedSets.set(key, sortedSet);
  }
  return sortedSet;
}

function makeRedisClient(watchError: WatchErrorConstructor): MockRedisClient {
  const client: MockRedisClient = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(async (key: string) => mockRedisStrings.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      mockRedisStrings.set(key, value);
      return 'OK';
    }),
    zRange: jest.fn(async (key: string, start: number, end: number) => {
      const values = [...(mockRedisSortedSets.get(key) ?? new Map()).entries()]
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        .map(([value]) => value);
      const normalizedEnd = end === -1 ? values.length : end + 1;
      return values.slice(start, normalizedEnd);
    }),
    zAdd: jest.fn(async (key: string, item: { score: number; value: string }) => {
      sortedSetFor(key).set(item.value, item.score);
      return 1;
    }),
    zRem: jest.fn(async (key: string, value: string) => {
      sortedSetFor(key).delete(value);
      return 1;
    }),
    hGet: jest.fn(async (key: string, field: string) => hashFor(key).get(field) ?? null),
    hSet: jest.fn(async (key: string, fieldOrEntries: string | Record<string, string>, value?: string) => {
      const hash = hashFor(key);
      if (typeof fieldOrEntries === 'string') {
        hash.set(fieldOrEntries, value!);
      } else {
        Object.entries(fieldOrEntries).forEach(([field, fieldValue]) => hash.set(field, fieldValue));
      }
      return 1;
    }),
    hDel: jest.fn(async (key: string, fields: string | string[]) => {
      const hash = hashFor(key);
      (Array.isArray(fields) ? fields : [fields]).forEach(field => hash.delete(field));
      return 1;
    }),
    duplicate: jest.fn(() => makeRedisClient(watchError)),
    watch: jest.fn(async (keys: string | string[]) => {
      mockWatchedKeys.push(keys);
      return 'OK';
    }),
    unwatch: jest.fn(async () => 'OK'),
    quit: jest.fn(async () => 'OK'),
    multi: jest.fn(() => {
      const commands: string[] = [];
      const operations: (() => void)[] = [];
      const transaction = {} as MockRedisTransaction;
      transaction.set = jest.fn((key: string, value: string) => {
        commands.push(`set:${key}`);
        operations.push(() => mockRedisStrings.set(key, value));
        return transaction;
      });
      transaction.zAdd = jest.fn((key: string, item: { score: number; value: string }) => {
        commands.push(`zAdd:${key}`);
        operations.push(() => sortedSetFor(key).set(item.value, item.score));
        return transaction;
      });
      transaction.hDel = jest.fn((key: string, fields: string | string[]) => {
        commands.push(`hDel:${key}`);
        operations.push(() => {
          const hash = hashFor(key);
          (Array.isArray(fields) ? fields : [fields]).forEach(field => hash.delete(field));
        });
        return transaction;
      });
      transaction.hSet = jest.fn((key: string, entries: Record<string, string>) => {
        commands.push(`hSet:${key}`);
        operations.push(() => {
          const hash = hashFor(key);
          Object.entries(entries).forEach(([field, value]) => hash.set(field, value));
        });
        return transaction;
      });
      transaction.exec = jest.fn(async () => {
        mockTransactionCommands.push(commands);
        if (mockAbortNextTransaction) {
          mockAbortNextTransaction = false;
          throw new watchError('watched key changed');
        }
        operations.forEach(operation => operation());
        return [];
      });
      return transaction;
    }),
    del: jest.fn(async (key: string) => {
      mockRedisStrings.delete(key);
      mockRedisHashes.delete(key);
      mockRedisSortedSets.delete(key);
      return 1;
    }),
  };
  return client;
}

jest.mock('redis', () => {
  class MockWatchError extends Error {}
  return {
    createClient: jest.fn(() => makeRedisClient(MockWatchError)),
    WatchError: MockWatchError,
  };
});

function collectionFor(name: string) {
  const documents = name === 'games' ? mockMongoGames : mockMongoTournaments;

  const cursorFor = (query: StoredDocument = {}) => {
    const matchingDocuments = [...documents.entries()]
      .filter(([, document]) => Object.entries(query).every(([key, value]) => document[key] === value))
      .map(([_id, document]) => ({ _id, ...clone(document) }));
    const cursor: {
      sort: jest.Mock;
      toArray: jest.Mock;
    } = {
      sort: jest.fn(),
      toArray: jest.fn(async () => matchingDocuments),
    };
    cursor.sort.mockReturnValue(cursor);
    return cursor;
  };

  return {
    find: jest.fn((query: StoredDocument = {}) => cursorFor(query)),
    findOne: jest.fn(async (filter: { _id: string }) => {
      const document = documents.get(filter._id);
      return document ? { _id: filter._id, ...clone(document) } : null;
    }),
    replaceOne: jest.fn(async (filter: { _id: string }, replacement: StoredDocument) => {
      documents.set(filter._id, clone(replacement));
      return { upsertedCount: 1 };
    }),
    deleteOne: jest.fn(async (filter: { _id: string }) => {
      const deleted = documents.delete(filter._id);
      return { deletedCount: deleted ? 1 : 0 };
    }),
    deleteMany: jest.fn(async (filter: StoredDocument = {}) => {
      if (Object.keys(filter).length === 0) {
        const count = documents.size;
        documents.clear();
        return { deletedCount: count };
      }
      return { deletedCount: 0 };
    }),
    bulkWrite: jest.fn().mockResolvedValue({}),
  };
}

jest.mock('mongodb', () => ({
  MongoClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn(() => ({
      collection: jest.fn((name: string) => collectionFor(name)),
    })),
  })),
}));

function makeTournament(match: Match, format: 'singles' | 'doubles' = 'doubles'): Tournament {
  return {
    id: 't1',
    name: 'Doubles persistence',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 1,
    rrBestOf: 3,
    bracketRounds: [{ matchCount: 1, bestOf: 1 }],
    players: ['p1', 'p2', 'p3', 'p4'],
    activePlayers: ['p1', 'p2', 'p3', 'p4'],
    roundRobinFormats: format === 'doubles' ? { 1: 'doubles' } : undefined,
    matches: [match],
  };
}

async function seedMatch(format: 'singles' | 'doubles' = 'doubles') {
  const [match] = createRoundRobinPairings(
    ['p1', 'p2', 'p3', 'p4'],
    't1',
    1,
    3,
    format,
  );
  await setTournament(makeTournament(match, format));
  await registerMatchesIndex([match]);
  return match;
}

const seedDoublesMatch = () => seedMatch('doubles');

function postRequest(matchId: string, score1: number, score2: number) {
  return adminRequest('http://localhost/api/games', {
    method: 'POST',
    body: JSON.stringify({
      matchId,
      // These must be ignored for a tournament match. The server derives the
      // participant snapshot from the stored doubles match.
      player1Id: 'spoofed-p1',
      player2Id: 'spoofed-p2',
      score1,
      score2,
    }),
  });
}

function updateRequest(gameId: string, body: Record<string, unknown>) {
  return updateGame(
    adminRequest(`http://localhost/api/games/${gameId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: gameId }) },
  );
}

function deleteRequest(gameId: string) {
  return deleteGame(
    adminRequest(`http://localhost/api/games/${gameId}`, { method: 'DELETE' }) as never,
    { params: Promise.resolve({ id: gameId }) },
  );
}

describe('doubles game persistence', () => {
  let nextTimestamp = 1000;

  beforeEach(() => {
    mockRedisStrings.clear();
    mockRedisHashes.clear();
    mockRedisSortedSets.clear();
    mockMongoGames.clear();
    mockMongoTournaments.clear();
    mockTransactionCommands.length = 0;
    mockWatchedKeys.length = 0;
    mockAbortNextTransaction = false;
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockImplementation(() => nextTimestamp++);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds a doubles game with server-authoritative participant snapshots', async () => {
    const match = await seedDoublesMatch();

    const response = await postGame(postRequest(match.id, 11, 5));
    const game = await response.json();
    const savedMatch = await getMatch(match.id);
    const history = await getAllGames();

    expect(response.status).toBe(201);
    expect(game).toMatchObject({
      player1Id: 'p1',
      player2Id: 'p2',
      side1PlayerIds: ['p1', 'p4'],
      side2PlayerIds: ['p2', 'p3'],
      score1: 11,
      score2: 5,
    });
    expect(savedMatch?.games[0]).toMatchObject({
      player1Id: 'p1',
      player2Id: 'p2',
      side1PlayerIds: ['p1', 'p4'],
      side2PlayerIds: ['p2', 'p3'],
    });
    expect(savedMatch?.winnerSide).toBeUndefined();
    expect(history).toHaveLength(1);
    expect(history[0].side1PlayerIds).toEqual(['p1', 'p4']);
    expect(history[0].side2PlayerIds).toEqual(['p2', 'p3']);
  });

  it('recomputes winnerSide after editing a persisted doubles game', async () => {
    const match = await seedDoublesMatch();
    const firstResponse = await postGame(postRequest(match.id, 11, 5));
    const firstGame = await firstResponse.json();
    const secondResponse = await postGame(postRequest(match.id, 11, 8));
    const secondGame = await secondResponse.json();

    let savedMatch = await getMatch(match.id);
    expect(savedMatch?.winnerSide).toBe(1);

    const losingEditResponse = await updateRequest(secondGame.id, { score1: 5, score2: 11 });
    expect(losingEditResponse.status).toBe(200);
    savedMatch = await getMatch(match.id);
    expect(savedMatch?.winnerSide).toBeUndefined();
    expect(savedMatch?.games[1]).toMatchObject({
      score1: 5,
      score2: 11,
      side1PlayerIds: ['p1', 'p4'],
      side2PlayerIds: ['p2', 'p3'],
    });

    const winningEditResponse = await updateRequest(secondGame.id, {
      player1Id: 'spoofed-p1',
      player2Id: 'spoofed-p2',
      score1: 11,
      score2: 8,
    });
    expect(winningEditResponse.status).toBe(400);

    const validWinningEditResponse = await updateRequest(secondGame.id, { score1: 11, score2: 8 });
    expect(validWinningEditResponse.status).toBe(200);
    savedMatch = await getMatch(match.id);
    expect(savedMatch?.winnerSide).toBe(1);
    expect(savedMatch?.games[1]).toMatchObject({
      score1: 11,
      score2: 8,
      side1PlayerIds: ['p1', 'p4'],
      side2PlayerIds: ['p2', 'p3'],
    });
    expect(firstGame.side1PlayerIds).toEqual(['p1', 'p4']);
  });

  it('clears winnerSide and removes history after deleting a doubles game', async () => {
    const match = await seedDoublesMatch();
    await postGame(postRequest(match.id, 11, 5));
    const secondResponse = await postGame(postRequest(match.id, 11, 8));
    const secondGame = await secondResponse.json();

    expect((await getMatch(match.id))?.winnerSide).toBe(1);

    const response = await deleteRequest(secondGame.id);
    const savedMatch = await getMatch(match.id);
    const history = await getAllGames();

    expect(response.status).toBe(200);
    expect(savedMatch?.winnerSide).toBeUndefined();
    expect(savedMatch?.games).toHaveLength(1);
    expect(savedMatch?.games[0].side1PlayerIds).toEqual(['p1', 'p4']);
    expect(history).toHaveLength(1);
    expect(history[0].side2PlayerIds).toEqual(['p2', 'p3']);
  });

  it('commits the tournament document and match index changes in one watched transaction', async () => {
    const oldMatch = await seedMatch('singles');

    const updatedTournament = await setRoundRobinFormatAtomically('t1', 1, 'doubles');
    const newMatch = updatedTournament.matches?.find(match => match.id !== oldMatch.id);

    expect(updatedTournament.roundRobinFormats).toEqual({ 1: 'doubles' });
    expect(newMatch?.side1PlayerIds).toHaveLength(2);
    expect(mockWatchedKeys).toEqual([
      expect.arrayContaining([
        expect.stringContaining(':pingpong:tournament:t1'),
        expect.stringContaining(':pingpong:match_index'),
      ]),
    ]);
    expect(mockTransactionCommands).toHaveLength(1);
    expect(mockTransactionCommands[0]).toEqual([
      expect.stringMatching(/^set:/),
      expect.stringMatching(/^zAdd:/),
      expect.stringMatching(/^hDel:/),
      expect.stringMatching(/^hSet:/),
    ]);
    expect(await getMatch(oldMatch.id)).toBeNull();
    expect(newMatch && await getMatch(newMatch.id)).toMatchObject({ id: newMatch?.id });
  });

  it('does not publish document or index changes when optimistic execution aborts', async () => {
    const oldMatch = await seedMatch('singles');
    mockAbortNextTransaction = true;

    await expect(setRoundRobinFormatAtomically('t1', 1, 'doubles'))
      .rejects.toBeInstanceOf(TournamentConflictError);

    const currentTournament = await getMatch(oldMatch.id);
    expect(currentTournament).toMatchObject({ id: oldMatch.id });
    expect(mockTransactionCommands).toHaveLength(1);
    expect(mockTransactionCommands[0]).toEqual([
      expect.stringMatching(/^set:/),
      expect.stringMatching(/^zAdd:/),
      expect.stringMatching(/^hDel:/),
      expect.stringMatching(/^hSet:/),
    ]);
  });
});
