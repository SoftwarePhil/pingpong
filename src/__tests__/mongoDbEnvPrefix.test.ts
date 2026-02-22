// ─────────────────────────────────────────────────────────────────────────────
// Shared mocks for both Redis and MongoDB
// ─────────────────────────────────────────────────────────────────────────────
const mockRedisClient = {
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
};

const mockMongoCollection = {
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([]),
  }),
  findOne: jest.fn().mockResolvedValue(null),
  replaceOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
  deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
  bulkWrite: jest.fn().mockResolvedValue({}),
};

const mockMongoDb = {
  collection: jest.fn().mockReturnValue(mockMongoCollection),
};

const mockMongoClient = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  db: jest.fn().mockReturnValue(mockMongoDb),
};

// data.ts is evaluated once per Jest worker; we reset modules so the ENV_PREFIX
// constant is derived from the NODE_ENV we set before import.
describe('Hybrid data layer — environment isolation', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('redis', () => ({ createClient: jest.fn(() => mockRedisClient) }));
    jest.doMock('mongodb', () => ({ MongoClient: jest.fn(() => mockMongoClient) }));
    mockRedisClient.get.mockClear();
    mockRedisClient.set.mockClear();
    mockRedisClient.zRange.mockClear();
    mockRedisClient.zRem.mockClear();
    mockRedisClient.del.mockClear();
    mockMongoClient.db.mockClear();
    mockMongoCollection.find.mockClear();
    mockMongoCollection.findOne.mockClear();
    mockMongoCollection.replaceOne.mockClear();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  it('prefixes Redis active tournament keys with the current NODE_ENV', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { getTournament } = await import('../data/data');
    await getTournament('t1');

    const calledKey: string = mockRedisClient.get.mock.calls[0][0];
    expect(calledKey).toMatch(/^test:/);
    expect(calledKey).toBe('test:pingpong:tournament:t1');
  });

  it('falls back to MongoDB when a tournament is not in Redis (completed)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    // Redis returns null → tournament is completed, lives in MongoDB
    mockRedisClient.get.mockResolvedValueOnce(null);

    const { getTournament } = await import('../data/data');
    await getTournament('t-completed');

    // Redis was checked first
    expect(mockRedisClient.get).toHaveBeenCalledWith('test:pingpong:tournament:t-completed');
    // MongoDB was then queried as fallback
    expect(mockMongoCollection.findOne).toHaveBeenCalledWith({ _id: 't-completed' });
  });

  it('writes a completed tournament to MongoDB and removes it from Redis', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { setTournament } = await import('../data/data');
    await setTournament({
      id: 't1',
      name: 'Finished Cup',
      startDate: new Date().toISOString(),
      status: 'completed',
      roundRobinRounds: 1,
      bracketRounds: [],
      players: [],
    });

    // Should be removed from Redis sorted set and key
    expect(mockRedisClient.zRem).toHaveBeenCalledWith(
      'test:pingpong:active_tournaments',
      't1'
    );
    expect(mockRedisClient.del).toHaveBeenCalledWith('test:pingpong:tournament:t1');
    // Should be persisted to MongoDB
    expect(mockMongoCollection.replaceOne).toHaveBeenCalledWith(
      { _id: 't1' },
      expect.objectContaining({ status: 'completed' }),
      { upsert: true }
    );
    // Should NOT be written to Redis
    expect(mockRedisClient.set).not.toHaveBeenCalled();
  });

  it('writes an active tournament to Redis only (not MongoDB tournaments collection)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { setTournament } = await import('../data/data');
    await setTournament({
      id: 't2',
      name: 'Spring Open',
      startDate: new Date().toISOString(),
      status: 'roundRobin',
      roundRobinRounds: 1,
      bracketRounds: [],
      players: [],
    });

    // Should be in Redis
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'test:pingpong:tournament:t2',
      expect.any(String)
    );
    expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
      'test:pingpong:active_tournaments',
      expect.objectContaining({ value: 't2' })
    );
    // Should NOT touch MongoDB tournaments collection via replaceOne for tournament
    // (replaceOne may be called for games/players but not with _id: 't2')
    const tournamentReplaceCall = mockMongoCollection.replaceOne.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>)._id === 't2'
    );
    expect(tournamentReplaceCall).toBeUndefined();
  });

  it('uses NODE_ENV in the MongoDB database name', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { dbName } = await import('../data/data');
    expect(dbName()).toBe('pingpong_test');
  });

  it('reads players from the NODE_ENV-scoped MongoDB database', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { getPlayers } = await import('../data/data');
    await getPlayers();

    const dbArg: string = mockMongoClient.db.mock.calls[0][0];
    expect(dbArg).toBe('pingpong_test');
  });

  it('reads all games from the NODE_ENV-scoped MongoDB database', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { getAllGames } = await import('../data/data');
    await getAllGames();

    const dbArg: string = mockMongoClient.db.mock.calls[0][0];
    expect(dbArg).toBe('pingpong_test');
  });
});
