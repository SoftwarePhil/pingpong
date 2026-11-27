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
  // createTournament writes through a transaction; record its commands on the
  // client mocks above so the tests can check the keys.
  multi: jest.fn(() => mockTransaction),
};

const mockTransaction: Record<string, jest.Mock> = {
  set: jest.fn((...args: unknown[]) => { mockRedisClient.set(...args); return mockTransaction; }),
  zAdd: jest.fn((...args: unknown[]) => { mockRedisClient.zAdd(...args); return mockTransaction; }),
  hSet: jest.fn((...args: unknown[]) => { mockRedisClient.hSet(...args); return mockTransaction; }),
  exec: jest.fn().mockResolvedValue([]),
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
// constant is derived from PINGPONG_ENV / NODE_ENV we set before import.
describe('Hybrid data layer — environment isolation', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalPingpongEnv = process.env.PINGPONG_ENV;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.PINGPONG_ENV;
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
    if (originalPingpongEnv === undefined) delete process.env.PINGPONG_ENV;
    else process.env.PINGPONG_ENV = originalPingpongEnv;
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

  it('creates a completed tournament in MongoDB only', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { createTournament } = await import('../data/data');
    await createTournament({
      clubId: 'club-dallas',
      id: 't1',
      name: 'Finished Cup',
      startDate: new Date().toISOString(),
      status: 'completed',
      roundRobinRounds: 1,
      rrBestOf: 1,
      bracketRounds: [],
      players: [],
    });

    // Should be persisted to MongoDB
    expect(mockMongoCollection.replaceOne).toHaveBeenCalledWith(
      { _id: 't1' },
      expect.objectContaining({ status: 'completed' }),
      { upsert: true }
    );
    // Should NOT be written to Redis
    expect(mockRedisClient.set).not.toHaveBeenCalled();
  });

  it('creates an active tournament in Redis only (not MongoDB tournaments collection)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { createTournament } = await import('../data/data');
    await createTournament({
      clubId: 'club-dallas',
      id: 't2',
      name: 'Spring Open',
      startDate: new Date().toISOString(),
      status: 'roundRobin',
      roundRobinRounds: 1,
      rrBestOf: 1,
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
    await getPlayers('club-1');

    const dbArg: string = mockMongoClient.db.mock.calls[0][0];
    expect(dbArg).toBe('pingpong_test');
  });

  it('reads all games from the NODE_ENV-scoped MongoDB database', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { getAllGames } = await import('../data/data');
    await getAllGames('club-1');

    const dbArg: string = mockMongoClient.db.mock.calls[0][0];
    expect(dbArg).toBe('pingpong_test');
  });

  it('prefers PINGPONG_ENV over NODE_ENV for both Redis keys and MongoDB database', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.PINGPONG_ENV = 'stage';

    const { ENV_PREFIX, dbName, getTournament, getPlayers } = await import('../data/data');
    expect(ENV_PREFIX).toBe('stage');
    expect(dbName()).toBe('pingpong_stage');

    await getTournament('t1');
    expect(mockRedisClient.get).toHaveBeenCalledWith('stage:pingpong:tournament:t1');

    await getPlayers('club-1');
    expect(mockMongoClient.db).toHaveBeenCalledWith('pingpong_stage');
  });

  it('falls back to NODE_ENV when PINGPONG_ENV is blank', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.PINGPONG_ENV = '   ';

    const { ENV_PREFIX, dbName } = await import('../data/data');
    expect(ENV_PREFIX).toBe('test');
    expect(dbName()).toBe('pingpong_test');
  });
});
