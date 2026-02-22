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
    mockMongoClient.db.mockClear();
    mockMongoCollection.find.mockClear();
    mockMongoCollection.findOne.mockClear();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  it('prefixes Redis tournament keys with the current NODE_ENV', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { getTournament } = await import('../data/data');
    await getTournament('t1');

    const calledKey: string = mockRedisClient.get.mock.calls[0][0];
    expect(calledKey).toMatch(/^test:/);
    expect(calledKey).toBe('test:pingpong:tournament:t1');
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
