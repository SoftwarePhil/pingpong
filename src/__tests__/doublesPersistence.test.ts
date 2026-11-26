import { POST as postGame } from '../app/api/games/route';
import { DELETE as deleteGame, PUT as updateGame } from '../app/api/games/[id]/route';
import { DELETE as deleteTournamentRoute, PUT as putTournament } from '../app/api/tournaments/route';
import { DELETE as deleteMatchRoute } from '../app/api/matches/[id]/route';
import {
  createTournament,
  getAllGames,
  getMatch,
  getTournament,
  getTournaments,
  mutateTournament,
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
const mockMongoClubs = new Map<string, StoredDocument>();
const mockMongoPlayers = new Map<string, StoredDocument>();
const mockTransactionCommands: string[][] = [];
const mockWatchedKeys: (string | string[])[] = [];
/** Transactions to fail as if a watched key changed, whatever really happened. */
let mockAbortTransactions = 0;
const mockKeyVersions = new Map<string, number>();
let mockFailTournamentWrites = false;
/** New connections opened with duplicate(), across every client. */
let mockDuplicateCount = 0;

type WatchErrorConstructor = new (message?: string) => Error;

type MockRedisTransaction = {
  set: jest.Mock<MockRedisTransaction, [string, string]>;
  zAdd: jest.Mock<MockRedisTransaction, [string, { score: number; value: string }]>;
  zRem: jest.Mock<MockRedisTransaction, [string, string]>;
  del: jest.Mock<MockRedisTransaction, [string]>;
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
  isOpen: boolean;
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

/** Every write to a key bumps its version, which is how WATCH notices it. */
function touch(key: string) {
  mockKeyVersions.set(key, (mockKeyVersions.get(key) ?? 0) + 1);
}

function makeRedisClient(watchError: WatchErrorConstructor): MockRedisClient {
  // Like Redis, WATCH state belongs to one connection.
  let watched: Map<string, number> | null = null;
  const client: MockRedisClient = {
    isOpen: true,
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(async (key: string) => mockRedisStrings.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      mockRedisStrings.set(key, value);
      touch(key);
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
      touch(key);
      return 1;
    }),
    zRem: jest.fn(async (key: string, value: string) => {
      sortedSetFor(key).delete(value);
      touch(key);
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
      touch(key);
      return 1;
    }),
    hDel: jest.fn(async (key: string, fields: string | string[]) => {
      const hash = hashFor(key);
      (Array.isArray(fields) ? fields : [fields]).forEach(field => hash.delete(field));
      touch(key);
      return 1;
    }),
    duplicate: jest.fn(() => {
      mockDuplicateCount++;
      return makeRedisClient(watchError);
    }),
    watch: jest.fn(async (keys: string | string[]) => {
      mockWatchedKeys.push(keys);
      watched = watched ?? new Map();
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        watched.set(key, mockKeyVersions.get(key) ?? 0);
      }
      return 'OK';
    }),
    unwatch: jest.fn(async () => {
      watched = null;
      return 'OK';
    }),
    quit: jest.fn(async () => {
      client.isOpen = false;
      return 'OK';
    }),
    multi: jest.fn(() => {
      const commands: string[] = [];
      const operations: (() => void)[] = [];
      const transaction = {} as MockRedisTransaction;
      const queue = (command: string, key: string, operation: () => void) => {
        commands.push(`${command}:${key}`);
        operations.push(() => { operation(); touch(key); });
        return transaction;
      };
      transaction.set = jest.fn((key: string, value: string) =>
        queue('set', key, () => mockRedisStrings.set(key, value)));
      transaction.zAdd = jest.fn((key: string, item: { score: number; value: string }) =>
        queue('zAdd', key, () => sortedSetFor(key).set(item.value, item.score)));
      transaction.zRem = jest.fn((key: string, value: string) =>
        queue('zRem', key, () => sortedSetFor(key).delete(value)));
      transaction.del = jest.fn((key: string) =>
        queue('del', key, () => mockRedisStrings.delete(key)));
      transaction.hDel = jest.fn((key: string, fields: string | string[]) =>
        queue('hDel', key, () => {
          const hash = hashFor(key);
          (Array.isArray(fields) ? fields : [fields]).forEach(field => hash.delete(field));
        }));
      transaction.hSet = jest.fn((key: string, entries: Record<string, string>) =>
        queue('hSet', key, () => {
          const hash = hashFor(key);
          Object.entries(entries).forEach(([field, value]) => hash.set(field, value));
        }));
      transaction.exec = jest.fn(async () => {
        mockTransactionCommands.push(commands);
        const seen = watched;
        watched = null;
        const changed = seen && [...seen].some(([key, version]) => (mockKeyVersions.get(key) ?? 0) !== version);
        if (mockAbortTransactions > 0) {
          mockAbortTransactions--;
          throw new watchError('watched key changed');
        }
        if (changed) throw new watchError('watched key changed');
        operations.forEach(operation => operation());
        return [];
      });
      return transaction;
    }),
    del: jest.fn(async (key: string) => {
      mockRedisStrings.delete(key);
      mockRedisHashes.delete(key);
      mockRedisSortedSets.delete(key);
      touch(key);
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

/** Enough of MongoDB's filters for these tests: plain values and `{ $exists: false }`. */
function matchesFilter(document: StoredDocument | undefined, filter: StoredDocument): boolean {
  if (!document) return false;
  return Object.entries(filter).every(([key, value]) => {
    if (key === '_id') return true;
    if (value && typeof value === 'object' && '$exists' in value) {
      return (key in document) === (value as { $exists: boolean }).$exists;
    }
    return document[key] === value;
  });
}

function collectionFor(name: string) {
  const documents = name === 'games' ? mockMongoGames
    : name === 'clubs' ? mockMongoClubs
    : name === 'players' ? mockMongoPlayers
    : mockMongoTournaments;

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
    replaceOne: jest.fn(async (filter: StoredDocument & { _id: string }, replacement: StoredDocument, options?: { upsert?: boolean }) => {
      if (mockFailTournamentWrites && name === 'tournaments') throw new Error('MongoDB is down');
      if (matchesFilter(documents.get(filter._id), filter)) {
        documents.set(filter._id, clone(replacement));
        return { matchedCount: 1, upsertedCount: 0 };
      }
      if (options?.upsert && !documents.has(filter._id)) {
        documents.set(filter._id, clone(replacement));
        return { matchedCount: 0, upsertedCount: 1 };
      }
      return { matchedCount: 0, upsertedCount: 0 };
    }),
    deleteOne: jest.fn(async (filter: StoredDocument & { _id: string }) => {
      const deleted = matchesFilter(documents.get(filter._id), filter) && documents.delete(filter._id);
      return { deletedCount: deleted ? 1 : 0 };
    }),
    deleteMany: jest.fn(async (filter: StoredDocument = {}) => {
      if (Object.keys(filter).length === 0) {
        const count = documents.size;
        documents.clear();
        return { deletedCount: count };
      }
      const ids = (filter._id as { $in?: string[] } | undefined)?.$in;
      if (ids) {
        const deleted = ids.filter(id => documents.delete(id)).length;
        return { deletedCount: deleted };
      }
      return { deletedCount: 0 };
    }),
    bulkWrite: jest.fn().mockResolvedValue({}),
    createIndex: jest.fn().mockResolvedValue('index'),
    // Enough of findOneAndUpdate for the default-club upsert: match on plain
    // fields, insert $setOnInsert when nothing matches.
    findOneAndUpdate: jest.fn(async (filter: StoredDocument, update: { $setOnInsert?: StoredDocument }) => {
      const found = [...documents.entries()].find(([, document]) =>
        Object.entries(filter).every(([key, value]) => document[key] === value));
      if (found) return { _id: found[0], ...clone(found[1]) };
      const { _id, ...fields } = update.$setOnInsert ?? {};
      documents.set(String(_id), clone(fields));
      return { _id, ...clone(fields) };
    }),
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

function makeTournament(match: Match, format: 'singles' | 'doubles' = 'doubles', clubId?: string): Tournament {
  return {
    clubId: 'club-dallas',
    id: 't1',
    ...(clubId && { clubId }),
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

async function seedMatch(format: 'singles' | 'doubles' = 'doubles', clubId?: string) {
  const [match] = createRoundRobinPairings(
    ['p1', 'p2', 'p3', 'p4'],
    't1',
    1,
    3,
    format,
  );
  await createTournament(makeTournament(match, format, clubId));
  // Count only the transactions a test makes, not the seeding.
  mockTransactionCommands.length = 0;
  mockWatchedKeys.length = 0;
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
    mockMongoClubs.clear();
    mockMongoPlayers.clear();
    mockTransactionCommands.length = 0;
    mockWatchedKeys.length = 0;
    mockKeyVersions.clear();
    mockAbortTransactions = 0;
    mockFailTournamentWrites = false;
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
    const history = await getAllGames('club-dallas');

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
    const history = await getAllGames('club-dallas');

    expect(response.status).toBe(200);
    expect(savedMatch?.winnerSide).toBeUndefined();
    expect(savedMatch?.games).toHaveLength(1);
    expect(savedMatch?.games[0].side1PlayerIds).toEqual(['p1', 'p4']);
    expect(history).toHaveLength(1);
    expect(history[0].side2PlayerIds).toEqual(['p2', 'p3']);
  });

  it('records a tournament\'s own club on its games and keeps it on the tournament', async () => {
    const match = await seedMatch('singles', 'club-dallas');

    await postGame(postRequest(match.id, 11, 5));

    const [game] = await getAllGames('club-dallas');
    expect(game.clubId).toBe('club-dallas');
    const stored = JSON.parse(mockRedisStrings.get('test:pingpong:tournament:t1')!);
    expect(stored.clubId).toBe('club-dallas');
  });

  it('keeps the club on a game after its score is edited', async () => {
    const match = await seedMatch('singles', 'club-dallas');
    const created = await (await postGame(postRequest(match.id, 11, 5))).json();

    const response = await updateRequest(created.id, { score1: 11, score2: 8 });

    expect(response.status).toBe(200);
    const [game] = await getAllGames('club-dallas');
    expect(game).toMatchObject({ score2: 8, clubId: 'club-dallas' });
  });

  it('sends a round 1 winner to their bye, and moves it if the score is corrected', async () => {
    const makeBracketMatch = (id: string, bracketRound: number, player1Id: string, player2Id: string): Match => ({
      id, tournamentId: 't1', player1Id, player2Id, round: 'bracket', bracketRound, bestOf: 1, games: [],
    });
    const opening = [
      makeBracketMatch('o1', 0, 'p1', 'p6'), makeBracketMatch('o2', 0, 'p2', 'p5'), makeBracketMatch('o3', 0, 'p3', 'p4'),
    ];
    const second = [
      makeBracketMatch('s1', 1, 'PLAY_IN_WINNER_1', 'BYE'),
      makeBracketMatch('s2', 1, 'PLAY_IN_WINNER_3', 'PLAY_IN_WINNER_2'),
    ];
    const bracket = [...opening, ...second];
    await createTournament({ ...makeTournament(bracket[0], 'singles'), status: 'bracket', matches: bracket });
    const stored = () => JSON.parse(mockRedisStrings.get('test:pingpong:tournament:t1')!) as Tournament;
    const bye = () => stored().matches!.find(m => m.id === 's1')!;

    const created = await (await postGame(postRequest('o1', 11, 5))).json();
    expect(bye()).toMatchObject({ player1Id: 'p1', winnerId: 'p1' });

    await updateRequest(created.id, { score1: 5, score2: 11 });
    expect(bye()).toMatchObject({ player1Id: 'p6', winnerId: 'p6' });
  });

  it('removes a deleted tournament\'s games from the game history', async () => {
    const match = await seedDoublesMatch();
    await postGame(postRequest(match.id, 11, 5));
    await postGame(postRequest(match.id, 11, 7));
    mockMongoGames.set('other-tournament-game', { clubId: 'club-dallas', matchId: 'elsewhere', player1Id: 'x', player2Id: 'y', score1: 11, score2: 3, date: '2026-01-01' });

    const response = await deleteTournamentRoute(
      adminRequest('http://localhost/api/tournaments?id=t1', { method: 'DELETE' }) as never,
    );

    expect(response.status).toBe(200);
    expect((await getAllGames('club-dallas')).map(game => game.id)).toEqual(['other-tournament-game']);
  });

  it('removes a deleted match\'s games from the game history', async () => {
    const match = await seedDoublesMatch();
    await postGame(postRequest(match.id, 11, 5));

    const response = await deleteMatchRoute(
      adminRequest(`http://localhost/api/matches/${match.id}`, { method: 'DELETE' }) as never,
      { params: Promise.resolve({ id: match.id }) },
    );

    expect(response.status).toBe(200);
    expect(await getAllGames('club-dallas')).toEqual([]);
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

  it('retries a change that lost a race, and commits it on the next try', async () => {
    const oldMatch = await seedMatch('singles');
    mockAbortTransactions = 1;

    const updatedTournament = await setRoundRobinFormatAtomically('t1', 1, 'doubles');

    expect(updatedTournament.roundRobinFormats).toEqual({ 1: 'doubles' });
    expect(mockTransactionCommands).toHaveLength(2);
    expect(await getMatch(oldMatch.id)).toBeNull();
  });

  it('gives up after eight lost races without publishing document or index changes', async () => {
    const oldMatch = await seedMatch('singles');
    mockAbortTransactions = 8;

    await expect(setRoundRobinFormatAtomically('t1', 1, 'doubles'))
      .rejects.toBeInstanceOf(TournamentConflictError);

    expect(await getMatch(oldMatch.id)).toMatchObject({ id: oldMatch.id });
    expect(mockTransactionCommands).toHaveLength(8);
    expect(mockTransactionCommands[0]).toEqual([
      expect.stringMatching(/^set:/),
      expect.stringMatching(/^zAdd:/),
      expect.stringMatching(/^hDel:/),
      expect.stringMatching(/^hSet:/),
    ]);
  });

  it('keeps both games when two admins score different matches at the same moment', async () => {
    // The bug this guards against (B4): both requests read the tournament,
    // each added its own game, and the second save dropped the first game.
    const [first, second] = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1, 3);
    await createTournament({ ...makeTournament(first, 'singles'), matches: [first, second] });
    mockTransactionCommands.length = 0;

    const responses = await Promise.all([
      postGame(postRequest(first.id, 11, 5)),
      postGame(postRequest(second.id, 11, 7)),
    ]);

    expect(responses.map(response => response.status)).toEqual([201, 201]);
    const tournament = await getTournament('t1');
    expect(tournament?.matches?.find(m => m.id === first.id)?.games).toHaveLength(1);
    expect(tournament?.matches?.find(m => m.id === second.id)?.games).toHaveLength(1);
    expect(tournament?.version).toBe(3);
    expect(await getAllGames('club-dallas')).toHaveLength(2);
    // On one server they queue rather than collide: two transactions, no retry.
    expect(mockTransactionCommands).toHaveLength(2);
  });

  it('rereads and reruns a change when another server saves the tournament first', async () => {
    // Two servers can't share the in-process queue, so WATCH has to catch it.
    const [first, second] = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1, 3);
    await createTournament({ ...makeTournament(first, 'singles'), matches: [first, second] });
    const key = 'test:pingpong:tournament:t1';

    let runs = 0;
    const { tournament } = await mutateTournament('t1', tournament => {
      runs++;
      if (runs === 1) {
        // The other server saves its change while this one is mid-change.
        const theirs = JSON.parse(mockRedisStrings.get(key)!) as Tournament;
        theirs.name = 'Renamed elsewhere';
        theirs.version = 2;
        mockRedisStrings.set(key, JSON.stringify(theirs));
        touch(key);
      }
      tournament.matches = tournament.matches!.map(m => m.id === first.id ? { ...m, bestOf: 5 } : m);
    });

    expect(runs).toBe(2);
    expect(tournament).toMatchObject({ name: 'Renamed elsewhere', version: 3 });
    expect(tournament.matches!.find(m => m.id === first.id)?.bestOf).toBe(5);
    expect(JSON.parse(mockRedisStrings.get(key)!)).toMatchObject({ name: 'Renamed elsewhere', version: 3 });
  });

  it('bumps the version once per committed change', async () => {
    const match = await seedDoublesMatch();
    expect((await getTournament('t1'))?.version).toBe(1);

    await postGame(postRequest(match.id, 11, 5));
    await postGame(postRequest(match.id, 11, 7));

    expect((await getTournament('t1'))?.version).toBe(3);
  });

  it('reuses its WATCH connection from one change to the next', async () => {
    const match = await seedDoublesMatch();
    mockDuplicateCount = 0;

    await postGame(postRequest(match.id, 11, 5));
    await postGame(postRequest(match.id, 11, 7));
    await expect(mutateTournament('t1', () => { throw new Error('no thanks'); })).rejects.toThrow('no thanks');
    await postGame(postRequest(match.id, 11, 9));

    // At most one new connection, even across a refused change.
    expect(mockDuplicateCount).toBeLessThanOrEqual(1);
    expect((await getTournament('t1'))?.matches?.[0].games).toHaveLength(3);
  });

  it('saves nothing when the change refuses', async () => {
    await seedMatch('singles');

    await expect(mutateTournament('t1', () => { throw new Error('no thanks'); })).rejects.toThrow('no thanks');

    expect(mockTransactionCommands).toHaveLength(0);
    expect((await getTournament('t1'))?.version).toBe(1);
  });

  it('moves a completed tournament to MongoDB, writing it there before dropping the Redis copy', async () => {
    await seedMatch('singles');

    const response = await putTournament(adminRequest('http://localhost/api/tournaments', {
      method: 'PUT',
      body: JSON.stringify({ id: 't1', status: 'completed' }),
    }) as never);

    expect(response.status).toBe(200);
    expect(mockRedisStrings.has('test:pingpong:tournament:t1')).toBe(false);
    expect(mockMongoTournaments.get('t1')).toMatchObject({ status: 'completed', version: 2 });
    expect((await getTournaments('club-dallas')).map(t => t.id)).toEqual(['t1']);
  });

  it('keeps an active tournament in Redis when its MongoDB write fails', async () => {
    await seedMatch('singles');
    mockFailTournamentWrites = true;

    await expect(mutateTournament('t1', tournament => { tournament.status = 'completed'; }))
      .rejects.toThrow('MongoDB is down');

    expect(JSON.parse(mockRedisStrings.get('test:pingpong:tournament:t1')!)).toMatchObject({ status: 'roundRobin', version: 1 });
    expect(mockTransactionCommands).toHaveLength(0);
  });

  it('takes back the MongoDB copy when completing loses a race', async () => {
    await seedMatch('singles');
    mockAbortTransactions = 8;

    await expect(mutateTournament('t1', tournament => { tournament.status = 'completed'; }))
      .rejects.toBeInstanceOf(TournamentConflictError);

    expect(mockMongoTournaments.has('t1')).toBe(false);
    expect(JSON.parse(mockRedisStrings.get('test:pingpong:tournament:t1')!)).toMatchObject({ status: 'roundRobin' });
  });

  it('edits a completed tournament in MongoDB, only over the version it read', async () => {
    const match = await seedMatch('singles');
    await mutateTournament('t1', tournament => { tournament.status = 'completed'; });

    let runs = 0;
    const { tournament } = await mutateTournament('t1', tournament => {
      runs++;
      // Someone else saves a newer copy while the first try is running.
      if (runs === 1) mockMongoTournaments.set('t1', { ...mockMongoTournaments.get('t1'), version: 7 });
      tournament.name = 'Renamed';
    });

    expect(runs).toBe(2);
    expect(tournament.version).toBe(8);
    expect(mockMongoTournaments.get('t1')).toMatchObject({ name: 'Renamed', version: 8 });
    expect(await getMatch(match.id)).toMatchObject({ id: match.id });
  });

  it('refuses to reopen a completed tournament', async () => {
    await seedMatch('singles');
    await mutateTournament('t1', tournament => { tournament.status = 'completed'; });

    await expect(mutateTournament('t1', tournament => { tournament.status = 'roundRobin'; }))
      .rejects.toThrow('A completed tournament cannot be reopened');
  });
});
