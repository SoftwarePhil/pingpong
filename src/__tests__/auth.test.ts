import { NextRequest } from 'next/server';
import { AUTH_COOKIE, createSessionToken, getSessionAdmin, readSessionAdminId, requireAdmin, requireOwner, SESSION_DAYS } from '../lib/auth';
import { adminRequest, ownerRequest, playerRequest, sessionRequest, TEST_ADMIN } from './authTestUtils';

function withCookie(value: string) {
  return new NextRequest('http://localhost', { headers: { cookie: `${AUTH_COOKIE}=${value}` } });
}

describe('auth sessions', () => {
  it('treats requests without a session as players', async () => {
    expect(await getSessionAdmin(playerRequest('http://localhost'))).toBeNull();
  });

  it('finds the admin behind a valid signed session', async () => {
    expect(await getSessionAdmin(adminRequest('http://localhost'))).toEqual(TEST_ADMIN);
  });

  it('rejects tampered, malformed and old password-style cookies', () => {
    const [id, issuedAt, signature] = createSessionToken('admin-1').split('.');
    expect(readSessionAdminId(withCookie(`admin-owner.${issuedAt}.${signature}`))).toBeNull();
    expect(readSessionAdminId(withCookie(`${id}.${Number(issuedAt) - 1}.${signature}`))).toBeNull();
    expect(readSessionAdminId(withCookie('admin.0123abcd'))).toBeNull();
    expect(readSessionAdminId(withCookie('nonsense'))).toBeNull();
  });

  it(`expires sessions after ${SESSION_DAYS} days`, () => {
    const now = Math.floor(Date.now() / 1000);
    const day = 24 * 60 * 60;
    expect(readSessionAdminId(withCookie(createSessionToken('admin-1', now - (SESSION_DAYS - 1) * day)))).toBe('admin-1');
    expect(readSessionAdminId(withCookie(createSessionToken('admin-1', now - (SESSION_DAYS + 1) * day)))).toBeNull();
  });

  it('signs out an admin whose account was removed', async () => {
    const request = sessionRequest('http://localhost', 'removed-admin');
    expect(readSessionAdminId(request)).toBe('removed-admin');
    expect(await getSessionAdmin(request)).toBeNull();
    expect((await requireAdmin(request)).denied?.status).toBe(403);
  });

  it('rejects player mutation requests', async () => {
    const { denied } = await requireAdmin(new NextRequest('http://localhost'));
    expect(denied?.status).toBe(403);
    expect(await denied?.json()).toEqual({ error: 'Admin access required' });
  });

  it('lets only owners manage admins', async () => {
    expect((await requireOwner(ownerRequest('http://localhost'))).denied).toBeNull();
    expect((await requireOwner(adminRequest('http://localhost'))).denied?.status).toBe(403);
    expect((await requireOwner(playerRequest('http://localhost'))).denied?.status).toBe(403);
  });
});
