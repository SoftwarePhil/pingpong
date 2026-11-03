import { createHash } from 'crypto';

jest.unmock('../data/admins');

type Doc = Record<string, unknown> & { _id: string };
const mockStore: Record<string, Map<string, Doc>> = { admins: new Map(), login_links: new Map() };

// Enough of MongoDB's matching for these queries: equality, and $gt on dates.
function matches(doc: Doc, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$gt' in value) return (doc[key] as Date) > (value as { $gt: Date }).$gt;
    return doc[key] === value;
  });
}

jest.mock('../data/data', () => ({
  getMongoDb: jest.fn(async () => ({
    collection: (name: string) => {
      const docs = mockStore[name];
      return {
        createIndex: jest.fn(),
        findOne: async (filter: Record<string, unknown>) => [...docs.values()].find(doc => matches(doc, filter)) ?? null,
        find: (filter: Record<string, unknown>) => ({ sort: () => ({ toArray: async () => [...docs.values()].filter(doc => matches(doc, filter)) }) }),
        countDocuments: async (filter: Record<string, unknown>) => [...docs.values()].filter(doc => matches(doc, filter)).length,
        insertOne: async (doc: Doc) => {
          if ([...docs.values()].some(other => name === 'admins' && other.email === doc.email)) throw Object.assign(new Error('dup'), { code: 11000 });
          docs.set(doc._id, doc);
        },
        deleteOne: async (filter: Record<string, unknown>) => {
          const doc = [...docs.values()].find(d => matches(d, filter));
          if (doc) docs.delete(doc._id);
          return { deletedCount: doc ? 1 : 0 };
        },
        findOneAndDelete: async (filter: Record<string, unknown>) => {
          const doc = [...docs.values()].find(d => matches(d, filter));
          if (doc) docs.delete(doc._id);
          return doc ?? null;
        },
        updateOne: async () => ({}),
      };
    },
  })),
}));

import { addAdmin, AdminExistsError, consumeLoginLink, createLoginLink, getAdminByEmail, LastOwnerError, removeAdmin } from '../data/admins';

beforeEach(() => Object.values(mockStore).forEach(docs => docs.clear()));

describe('admin accounts', () => {
  it('stores emails lowercase and refuses duplicates', async () => {
    await addAdmin({ clubId: 'c1', email: ' Phil@Example.com ', name: 'Phil', role: 'owner' });

    expect(await getAdminByEmail('PHIL@example.com')).toMatchObject({ email: 'phil@example.com', name: 'Phil' });
    await expect(addAdmin({ clubId: 'c1', email: 'phil@example.com', name: 'Again', role: 'admin' })).rejects.toBeInstanceOf(AdminExistsError);
  });

  it("keeps at least one owner and only removes admins of the caller's club", async () => {
    const owner = await addAdmin({ clubId: 'c1', email: 'owner@example.com', name: 'Owner', role: 'owner' });
    const admin = await addAdmin({ clubId: 'c1', email: 'admin@example.com', name: 'Admin', role: 'admin' });

    await expect(removeAdmin('c1', owner.id)).rejects.toBeInstanceOf(LastOwnerError);
    expect(await removeAdmin('c2', admin.id)).toBe(false);
    expect(await removeAdmin('c1', admin.id)).toBe(true);
  });
});

describe('sign-in links', () => {
  it('stores only a hash of the token, and each token works once', async () => {
    const token = await createLoginLink('admin-1');

    expect(mockStore.login_links.has(token)).toBe(false);
    expect(mockStore.login_links.has(createHash('sha256').update(token).digest('hex'))).toBe(true);
    expect(await consumeLoginLink(token)).toBe('admin-1');
    expect(await consumeLoginLink(token)).toBeNull();
  });

  it('refuses an expired token', async () => {
    const token = await createLoginLink('admin-1');
    jest.useFakeTimers({ now: Date.now() + 16 * 60_000 });
    try {
      expect(await consumeLoginLink(token)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses unknown tokens', async () => {
    expect(await consumeLoginLink('made-up')).toBeNull();
  });
});

describe('email addresses', () => {
  it('ignores invisible characters that pasting or autofill add', async () => {
    const { normalizeEmail, isValidEmail } = jest.requireActual('../data/admins');
    expect(normalizeEmail(' P@PhilDiMarco.com ')).toBe('p@phildimarco.com');
    expect(normalizeEmail('​p@phildimarco.com​')).toBe('p@phildimarco.com');
    expect(isValidEmail('p@phildimarco.com ')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('p@localhost')).toBe(false);
  });
});

it('rejects a comma typed for a period', () => {
  const { isValidEmail } = jest.requireActual('../data/admins');
  expect(isValidEmail('p@phildimarco,com')).toBe(false);
});
