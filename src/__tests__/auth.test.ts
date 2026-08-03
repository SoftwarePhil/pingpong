import { NextRequest } from 'next/server';
import { getRole, isValidAdminPassword, requireAdmin } from '../lib/auth';
import { adminRequest, playerRequest } from './authTestUtils';

describe('auth', () => {
  const originalPassword = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  });

  it('treats requests without a session as players', () => {
    expect(getRole(playerRequest('http://localhost'))).toBe('player');
  });

  it('recognizes a valid signed admin session', () => {
    expect(getRole(adminRequest('http://localhost'))).toBe('admin');
    expect(getRole(new NextRequest('http://localhost', {
      headers: { cookie: 'pingpong_session=admin.invalid' },
    }))).toBe('player');
  });

  it('validates the configured admin password', () => {
    process.env.ADMIN_PASSWORD = 'secret';
    expect(isValidAdminPassword('secret')).toBe(true);
    expect(isValidAdminPassword('wrong')).toBe(false);
  });

  it('rejects player mutation requests', async () => {
    const response = requireAdmin(new NextRequest('http://localhost'));
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: 'Admin access required' });
  });
});
