import { NextRequest, NextResponse } from 'next/server';
import { createLoginLink, getAdminByEmail, normalizeEmail } from '../../../../data/admins';
import { allowAttempt } from '../../../../data/rateLimit';
import { sendLoginLinkEmail } from '../../../../lib/email';

const WINDOW_SECONDS = 15 * 60;
const PER_EMAIL = 3;
const PER_IP = 10;

/**
 * Where sign-in links point. APP_URL wins; on Vercel the deployment's own
 * URL; locally the request's origin. Never the Host header in production,
 * which a caller could set to send the token to their own site, so a
 * production server with neither refuses to send links at all.
 */
function appOrigin(request: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV === 'production') throw new Error('APP_URL is not set');
  return request.nextUrl.origin;
}

/**
 * The caller's address, for rate limiting. Fly's proxy adds the real address
 * to the end of X-Forwarded-For, so its first entry is whatever the caller
 * sent; on Fly, trust Fly-Client-IP instead.
 */
function clientIp(request: NextRequest): string {
  if (process.env.FLY_APP_NAME) {
    const flyIp = request.headers.get('fly-client-ip')?.trim();
    if (flyIp) return flyIp;
  }
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

/**
 * Emails a sign-in link to an admin. The reply is the same whether or not
 * the email belongs to an admin, so it can't be used to find admin emails.
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({}));
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Enter your email address' }, { status: 400 });
  }
  const address = normalizeEmail(email);
  const ip = clientIp(request);

  try {
    // Worked out before the admin lookup so a missing APP_URL fails the same
    // way for every email and can't reveal which ones are admins.
    const origin = appOrigin(request);
    const allowed = await allowAttempt(`login-ip:${ip}`, PER_IP, WINDOW_SECONDS)
      && await allowAttempt(`login-email:${address}`, PER_EMAIL, WINDOW_SECONDS);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many sign-in requests. Try again in 15 minutes.' }, { status: 429 });
    }

    const admin = await getAdminByEmail(address);
    if (admin) {
      const token = await createLoginLink(admin.id);
      // The token goes in the fragment so it isn't sent to the server or kept in its logs.
      await sendLoginLinkEmail({ to: admin.email, name: admin.name, url: `${origin}/sign-in#token=${token}` });
    }
    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error('Error sending sign-in link:', error);
    return NextResponse.json({ error: 'Could not send the sign-in link. Try again.' }, { status: 500 });
  }
}
