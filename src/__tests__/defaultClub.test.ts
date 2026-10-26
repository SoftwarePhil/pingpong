const mockClubs = {
  createIndex: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
};

jest.mock('redis', () => ({ createClient: jest.fn(), WatchError: class extends Error {} }));
jest.mock('mongodb', () => ({
  MongoClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn(() => ({ collection: jest.fn(() => mockClubs) })),
  })),
}));

const dallas = { _id: 'club-dallas', name: 'dallas', slug: 'dallas', createdAt: '2026-10-26T00:00:00.000Z' };

// getDefaultClub caches per process, so each test loads a fresh copy of the module.
function loadGetDefaultClub(): typeof import('../data/data').getDefaultClub {
  let getDefaultClub!: typeof import('../data/data').getDefaultClub;
  jest.isolateModules(() => {
    ({ getDefaultClub } = jest.requireActual('../data/data'));
  });
  return getDefaultClub;
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockClubs.createIndex.mockResolvedValue('slug_1');
});

describe('getDefaultClub', () => {
  it('creates the club once, behind a unique slug index', async () => {
    mockClubs.findOneAndUpdate.mockResolvedValue(dallas);
    const getDefaultClub = loadGetDefaultClub();

    const [first, second] = await Promise.all([getDefaultClub(), getDefaultClub()]);

    expect(first).toEqual({ id: 'club-dallas', name: 'dallas', slug: 'dallas', createdAt: dallas.createdAt });
    expect(second).toBe(first);
    expect(mockClubs.createIndex).toHaveBeenCalledWith({ slug: 1 }, { unique: true });
    expect(mockClubs.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('uses the club another server created when both insert at once', async () => {
    mockClubs.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    mockClubs.findOne.mockResolvedValue(dallas);

    const club = await loadGetDefaultClub()();

    expect(club.id).toBe('club-dallas');
    expect(mockClubs.findOne).toHaveBeenCalledWith({ slug: 'dallas' });
  });

  it("retries on the next call instead of caching a failure", async () => {
    mockClubs.findOneAndUpdate.mockRejectedValueOnce(new Error('Mongo unavailable')).mockResolvedValueOnce(dallas);
    const getDefaultClub = loadGetDefaultClub();

    await expect(getDefaultClub()).rejects.toThrow('Mongo unavailable');
    await expect(getDefaultClub()).resolves.toMatchObject({ id: 'club-dallas' });
  });
});
