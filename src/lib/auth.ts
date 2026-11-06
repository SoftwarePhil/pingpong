import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminById } from '../data/admins';
import { Admin } from '../types/pingpong';

export type UserRole = 'player' | 'admin';

export const AUTH_COOKIE = 'pingpong_session';
export const SESSION_DAYS = 90;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

function secret() {
  const configured = process.env.AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is not set');
  return 'development-only-secret';
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

/** `<adminId>.<issued at, unix seconds>.<signature>` */
export function createSessionToken(adminId: string, issuedAt = Math.floor(Date.now() / 1000)) {
  return `${adminId}.${issuedAt}.${sign(`session|${adminId}|${issuedAt}`)}`;
}

/** The admin id in a validly signed, unexpired session cookie, or null. Doesn't check the admin still exists. */
export function readSessionAdminId(request: NextRequest): string | null {
  return adminIdFromToken(request.cookies.get(AUTH_COOKIE)?.value);
}

/** The admin id in a session token, for server components that read cookies directly. */
export function adminIdFromToken(token: string | undefined): string | null {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 3) return null;
  const [adminId, issuedAtText, signature] = parts;
  const issuedAt = Number(issuedAtText);
  if (!adminId || !Number.isInteger(issuedAt)) return null;

  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age < 0 || age > SESSION_SECONDS) return null;

  const expected = sign(`session|${adminId}|${issuedAt}`);
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? adminId : null;
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
