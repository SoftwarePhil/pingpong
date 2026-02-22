// Capture the mock db/collection so we can inspect calls
const mockToArray = jest.fn().mockResolvedValue([]);
const mockCursor = {
  sort: jest.fn().mockReturnThis(),
  toArray: mockToArray,
};

const mockCollection = {
  find: jest.fn().mockReturnValue(mockCursor),
  findOne: jest.fn().mockResolvedValue(null),
  replaceOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
  deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
  bulkWrite: jest.fn().mockResolvedValue({}),
};

const mockDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
};

const mockMongoClient = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  db: jest.fn().mockReturnValue(mockDb),
};

// data.ts is evaluated once per Jest worker; we reset modules so the ENV_PREFIX
// constant is derived from the NODE_ENV we set before import.
describe('MongoDB database environment prefix', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('mongodb', () => ({ MongoClient: jest.fn(() => mockMongoClient) }));
    mockMongoClient.db.mockClear();
    mockCollection.find.mockClear();
    mockCollection.findOne.mockClear();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  it('uses NODE_ENV in the database name', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { dbName } = await import('../data/data');
    expect(dbName()).toMatch(/^pingpong_test/);
    expect(dbName()).toBe('pingpong_test');
  });

  it('uses NODE_ENV-scoped database when getting players', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { getPlayers } = await import('../data/data');
    await getPlayers();

    const dbArg: string = mockMongoClient.db.mock.calls[0][0];
    expect(dbArg).toBe('pingpong_test');
  });

  it('uses NODE_ENV-scoped database when getting a tournament', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const { getTournament } = await import('../data/data');
    await getTournament('t1');

    const dbArg: string = mockMongoClient.db.mock.calls[0][0];
    expect(dbArg).toBe('pingpong_test');
  });
});
