// Capture the mock client so we can inspect calls
const mockClient = {
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

// data.ts is evaluated once per Jest worker; we reset modules so the ENV_PREFIX
// constant is derived from the NODE_ENV we set before import.
describe('Redis key environment prefix', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('redis', () => ({ createClient: jest.fn(() => mockClient) }));
    mockClient.get.mockClear();
    mockClient.set.mockClear();
    mockClient.zRange.mockClear();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('prefixes keys with the current NODE_ENV', async () => {
    process.env.NODE_ENV = 'test';

    const { getPlayers } = await import('../data/data');
    await getPlayers();

    const calledKey: string = mockClient.get.mock.calls[0][0];
    expect(calledKey).toMatch(/^test:/);
    expect(calledKey).toBe('test:pingpong:players');
  });

  it('prefixes tournament keys with the current NODE_ENV', async () => {
    process.env.NODE_ENV = 'test';

    const { getTournament } = await import('../data/data');
    await getTournament('t1');

    const calledKey: string = mockClient.get.mock.calls[0][0];
    expect(calledKey).toBe('test:pingpong:tournament:t1');
  });
});
