import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export type UserRole = 'player' | 'admin';

export const AUTH_COOKIE = 'pingpong_session';

function secret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'development-only-secret';
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

export function createSessionToken(role: UserRole) {
  return `${role}.${sign(role)}`;
}

export function getRole(request: NextRequest): UserRole {
  const value = request.cookies.get(AUTH_COOKIE)?.value;
  if (!value) return 'player';

  const [role, signature] = value.split('.');
  if (role !== 'admin' || !signature) return 'player';

  const expected = sign(role);
  if (signature.length !== expected.length) return 'player';
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? 'admin' : 'player';
}

export function isAdmin(request: NextRequest) {
  return getRole(request) === 'admin';
}

export function requireAdmin(request: NextRequest) {
  if (isAdmin(request)) return null;
  return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
}

export function isValidAdminPassword(password: unknown) {
  const configured = process.env.ADMIN_PASSWORD;
  if (typeof password !== 'string' || !configured) return false;
  const supplied = Buffer.from(password);
  const expected = Buffer.from(configured);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function setAdminSession(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, createSessionToken('admin'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export function clearAdminSession(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
