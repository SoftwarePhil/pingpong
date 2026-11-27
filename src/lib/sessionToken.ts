import { createHmac, timingSafeEqual } from 'crypto';

export const AUTH_COOKIE = 'pingpong_session';
export const SESSION_DAYS = 90;
export const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

function secret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is not set');
  return 'development-only-secret';
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

/** `<adminId>.<issued at, unix seconds>.<signature>` */
export function createSessionToken(adminId: string, issuedAt = Math.floor(Date.now() / 1000)): string {
  return `${adminId}.${issuedAt}.${sign(`session|${adminId}|${issuedAt}`)}`;
}

/** The admin id in a session token, for server components and WebSocket upgrades. */
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

/** Extracts a named cookie value from an HTTP `Cookie` header. */
export function readCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

/** Extracts and validates the signed admin id from an HTTP `Cookie` header. */
export function adminIdFromCookieHeader(cookieHeader: string | undefined): string | null {
  try {
    return adminIdFromToken(readCookieValue(cookieHeader, AUTH_COOKIE));
  } catch {
    return null;
  }
}
