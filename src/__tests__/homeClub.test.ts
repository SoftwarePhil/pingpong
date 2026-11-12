import { createSessionToken } from '../lib/auth';
import { findHomeClubSlug } from '../lib/homeClub';
import { TEST_ADMIN } from './authTestUtils';

jest.mock('../data/data', () => ({
  getClubById: jest.fn(),
  getClubBySlug: jest.fn(),
}));

import { getClubById, getClubBySlug } from '../data/data';

const mockedGetClubById = getClubById as jest.MockedFunction<typeof getClubById>;
const mockedGetClubBySlug = getClubBySlug as jest.MockedFunction<typeof getClubBySlug>;

const club = (slug: string) => ({ id: `club-${slug}`, name: slug, slug, createdAt: '2026-01-01T00:00:00.000Z' });

beforeEach(() => jest.clearAllMocks());

describe('findHomeClubSlug', () => {
  it('shows the splash page to a first-time visitor without touching the database', async () => {
    expect(await findHomeClubSlug()).toBeNull();
    expect(mockedGetClubBySlug).not.toHaveBeenCalled();
  });

  it('returns a visitor to the last club they opened', async () => {
    mockedGetClubBySlug.mockResolvedValue(club('dallas'));
    expect(await findHomeClubSlug(undefined, 'dallas')).toBe('dallas');
  });

  it('shows the splash page when the remembered club no longer exists', async () => {
    mockedGetClubBySlug.mockResolvedValue(null);
    expect(await findHomeClubSlug(undefined, 'gone')).toBeNull();
  });

  it("prefers an admin's own club over the remembered one", async () => {
    mockedGetClubById.mockResolvedValue(club('dallas'));
    expect(await findHomeClubSlug(createSessionToken(TEST_ADMIN.id), 'austin')).toBe('dallas');
    expect(mockedGetClubById).toHaveBeenCalledWith(TEST_ADMIN.clubId);
  });

  it('ignores a forged session and uses the remembered club', async () => {
    mockedGetClubBySlug.mockResolvedValue(club('austin'));
    expect(await findHomeClubSlug('admin-1.123.forged', 'austin')).toBe('austin');
    expect(mockedGetClubById).not.toHaveBeenCalled();
  });
});
