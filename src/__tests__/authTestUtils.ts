import { NextRequest } from 'next/server';
import { AUTH_COOKIE, createSessionToken } from '../lib/auth';
import { Admin } from '../types/pingpong';

type TestRequestInit = {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
};

export const TEST_OWNER: Admin = {
  id: 'admin-owner', clubId: 'club-dallas', email: 'owner@example.com', name: 'Owner', role: 'owner', createdAt: '2026-11-01T00:00:00.000Z',
};
export const TEST_ADMIN: Admin = {
  id: 'admin-1', clubId: 'club-dallas', email: 'admin@example.com', name: 'Admin', role: 'admin', createdAt: '2026-11-01T00:00:00.000Z',
};
/** The admins src/test/setup.ts lets sessions find. */
export const TEST_ADMINS: Admin[] = [TEST_OWNER, TEST_ADMIN];

export function sessionRequest(url: string, adminId: string, init: TestRequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${AUTH_COOKIE}=${createSessionToken(adminId)}`);
  return new NextRequest(url, { ...init, headers });
}

export function adminRequest(url: string, init: TestRequestInit = {}) {
  return sessionRequest(url, TEST_ADMIN.id, init);
}

export function ownerRequest(url: string, init: TestRequestInit = {}) {
  return sessionRequest(url, TEST_OWNER.id, init);
}

export function playerRequest(url: string, init: TestRequestInit = {}) {
  return new NextRequest(url, init);
}
