import { NextRequest, NextResponse } from 'next/server';
import { getAdminById } from '../data/admins';
import { Admin } from '../types/pingpong';
import {
  AUTH_COOKIE,
  SESSION_DAYS,
  SESSION_SECONDS,
  adminIdFromToken,
  createSessionToken,
} from './sessionToken';

export type UserRole = 'player' | 'admin';

export { AUTH_COOKIE, SESSION_DAYS, adminIdFromToken, createSessionToken };

/** The admin id in a validly signed, unexpired session cookie, or null. Doesn't check the admin still exists. */
export function readSessionAdminId(request: NextRequest): string | null {
  return adminIdFromToken(request.cookies.get(AUTH_COOKIE)?.value);
}

/**
 * The signed-in admin. The account is looked up on every request, so
 * removing an admin signs them out everywhere straight away.
 */
export async function getSessionAdmin(request: NextRequest): Promise<Admin | null> {
  const adminId = readSessionAdminId(request);
  return adminId ? getAdminById(adminId) : null;
}

/** The signed-in admin, otherwise the response to send. Admins can only change their own club's records. */
export async function requireAdmin(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (admin) return { admin, denied: null };
  return { admin: null, denied: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
}

/** The signed-in admin if they own their club, otherwise the response to send. */
export async function requireOwner(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (admin?.role === 'owner') return { owner: admin, denied: null };
  return { owner: null, denied: NextResponse.json({ error: 'Only club owners can manage admins' }, { status: 403 }) };
}

export function setAdminSession(response: NextResponse, adminId: string) {
  response.cookies.set(AUTH_COOKIE, createSessionToken(adminId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  return response;
}

export function clearAdminSession(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
