import { NextRequest } from 'next/server';
import { POST as requestLink } from '../app/api/auth/link/route';
import { POST as verifyLink } from '../app/api/auth/verify/route';
import { GET as getSession } from '../app/api/auth/session/route';
import { AUTH_COOKIE, readSessionAdminId } from '../lib/auth';
import { adminRequest, playerRequest, TEST_ADMIN } from './authTestUtils';

jest.mock('../data/admins', () => ({
  ...jest.requireActual('../data/admins'),
  getAdminById: jest.fn(),
  getAdminByEmail: jest.fn(),
  createLoginLink: jest.fn(),
  consumeLoginLink: jest.fn(),
  recordSignIn: jest.fn(),
}));
jest.mock('../data/rateLimit', () => ({ allowAttempt: jest.fn() }));
jest.mock('../lib/email', () => ({ sendLoginLinkEmail: jest.fn() }));

import { consumeLoginLink, createLoginLink, getAdminByEmail, getAdminById, recordSignIn } from '../data/admins';
import { allowAttempt } from '../data/rateLimit';
import { sendLoginLinkEmail } from '../lib/email';

const mocked = {
  getAdminById: getAdminById as jest.MockedFunction<typeof getAdminById>,
  getAdminByEmail: getAdminByEmail as jest.MockedFunction<typeof getAdminByEmail>,
  createLoginLink: createLoginLink as jest.MockedFunction<typeof createLoginLink>,
  consumeLoginLink: consumeLoginLink as jest.MockedFunction<typeof consumeLoginLink>,
  allowAttempt: allowAttempt as jest.MockedFunction<typeof allowAttempt>,
  sendLoginLinkEmail: sendLoginLinkEmail as jest.MockedFunction<typeof sendLoginLinkEmail>,
};

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.APP_URL;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_ENV;
  mocked.allowAttempt.mockResolvedValue(true);
  mocked.createLoginLink.mockResolvedValue('token-123');
  mocked.getAdminById.mockImplementation(async id => (id === TEST_ADMIN.id ? TEST_ADMIN : null));
});

afterAll(() => { process.env = originalEnv; });

describe('POST /api/auth/link', () => {
  it('emails a single-use link with the token in the URL fragment', async () => {
    mocked.getAdminByEmail.mockResolvedValue(TEST_ADMIN);

    const res = await requestLink(post('http://localhost:3000/api/auth/link', { email: ' Admin@Example.com ' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(mocked.getAdminByEmail).toHaveBeenCalledWith('admin@example.com');
    expect(mocked.createLoginLink).toHaveBeenCalledWith(TEST_ADMIN.id);
    expect(mocked.sendLoginLinkEmail).toHaveBeenCalledWith({
      to: TEST_ADMIN.email, name: TEST_ADMIN.name, url: 'http://localhost:3000/sign-in#token=token-123',
    });
  });

  it('gives the same reply for an email that is not an admin, and sends nothing', async () => {
    mocked.getAdminByEmail.mockResolvedValue(null);

    const res = await requestLink(post('http://localhost/api/auth/link', { email: 'stranger@example.com' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(mocked.createLoginLink).not.toHaveBeenCalled();
    expect(mocked.sendLoginLinkEmail).not.toHaveBeenCalled();
  });

  it('builds links from the configured app URL, not the Host header', async () => {
    process.env.APP_URL = 'https://pingpong.beer/';
    mocked.getAdminByEmail.mockResolvedValue(TEST_ADMIN);

    await requestLink(post('http://attacker.example/api/auth/link', { email: TEST_ADMIN.email }));

    expect(mocked.sendLoginLinkEmail.mock.calls[0][0].url).toBe('https://pingpong.beer/sign-in#token=token-123');
  });

  it('limits requests per address and per email', async () => {
    mocked.allowAttempt.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const res = await requestLink(post('http://localhost/api/auth/link', { email: TEST_ADMIN.email }, { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }));

    expect(res.status).toBe(429);
    expect(mocked.allowAttempt).toHaveBeenCalledWith('login-ip:1.2.3.4', 10, 900);
    expect(mocked.allowAttempt).toHaveBeenCalledWith('login-email:admin@example.com', 3, 900);
    expect(mocked.getAdminByEmail).not.toHaveBeenCalled();
  });

  it('accepts an email with a pasted non-breaking or zero-width space', async () => {
    mocked.getAdminByEmail.mockResolvedValue(TEST_ADMIN);

    const res = await requestLink(post('http://localhost/api/auth/link', { email: 'admin@example.com\u00a0\u200b' }));

    expect(res.status).toBe(200);
    expect(mocked.getAdminByEmail).toHaveBeenCalledWith('admin@example.com');
  });

  it('rejects a missing or malformed email', async () => {
    expect((await requestLink(post('http://localhost/api/auth/link', {}))).status).toBe(400);
    expect((await requestLink(post('http://localhost/api/auth/link', { email: 'not-an-email' }))).status).toBe(400);
  });

  it('reports a failure to send instead of claiming it worked', async () => {
    mocked.getAdminByEmail.mockResolvedValue(TEST_ADMIN);
    mocked.sendLoginLinkEmail.mockRejectedValue(new Error('Resend down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await requestLink(post('http://localhost/api/auth/link', { email: TEST_ADMIN.email }));

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/verify', () => {
  it('trades a valid token for a 90-day session cookie', async () => {
    mocked.consumeLoginLink.mockResolvedValue(TEST_ADMIN.id);

    const res = await verifyLink(post('http://localhost/api/auth/verify', { token: 'token-123' }));

    expect(res.status).toBe(200);
    expect(mocked.consumeLoginLink).toHaveBeenCalledWith('token-123');
    expect(recordSignIn).toHaveBeenCalledWith(TEST_ADMIN.id);
    const cookie = res.cookies.get(AUTH_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', maxAge: 90 * 24 * 60 * 60 });
    const next = new NextRequest('http://localhost', { headers: { cookie: `${AUTH_COOKIE}=${cookie.value}` } });
    expect(readSessionAdminId(next)).toBe(TEST_ADMIN.id);
  });

  it('refuses an expired, used or unknown token', async () => {
    mocked.consumeLoginLink.mockResolvedValue(null);

    const res = await verifyLink(post('http://localhost/api/auth/verify', { token: 'used' }));

    expect(res.status).toBe(401);
    expect(res.cookies.get(AUTH_COOKIE)).toBeUndefined();
  });

  it('refuses a token whose admin was removed after it was sent', async () => {
    mocked.consumeLoginLink.mockResolvedValue('removed-admin');

    const res = await verifyLink(post('http://localhost/api/auth/verify', { token: 'token-123' }));

    expect(res.status).toBe(401);
    expect(recordSignIn).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/session', () => {
  it('describes the signed-in admin', async () => {
    const res = await getSession(adminRequest('http://localhost/api/auth/session'));
    expect(await res.json()).toEqual({
      role: 'admin',
      admin: { id: TEST_ADMIN.id, name: TEST_ADMIN.name, email: TEST_ADMIN.email, role: 'admin', clubId: TEST_ADMIN.clubId },
    });
  });

  it('treats visitors without a session as players', async () => {
    const res = await getSession(playerRequest('http://localhost/api/auth/session'));
    expect(await res.json()).toEqual({ role: 'player', admin: null });
  });
});
