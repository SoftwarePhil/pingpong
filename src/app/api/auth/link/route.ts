import { NextRequest, NextResponse } from 'next/server';
import { createLoginLink, getAdminByEmail, isValidEmail, normalizeEmail } from '../../../../data/admins';
import { allowAttempt } from '../../../../data/rateLimit';
import { sendLoginLinkEmail } from '../../../../lib/email';

const WINDOW_SECONDS = 15 * 60;
const PER_EMAIL = 3;
const PER_IP = 10;

/**
 * Where sign-in links point. APP_URL wins; on Vercel the deployment's own
 * URL; locally the request's origin. Never the Host header in production,
 * which a caller could set to send the token to their own site.
 */
function appOrigin(request: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return request.nextUrl.origin;
}

/**
 * Emails a sign-in link to an admin. The reply is the same whether or not
 * the email belongs to an admin, so it can't be used to find admin emails.
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({}));
  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter your email address' }, { status: 400 });
  }
  const address = normalizeEmail(email);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  try {
    const allowed = await allowAttempt(`login-ip:${ip}`, PER_IP, WINDOW_SECONDS)
      && await allowAttempt(`login-email:${address}`, PER_EMAIL, WINDOW_SECONDS);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many sign-in requests. Try again in 15 minutes.' }, { status: 429 });
    }

    const admin = await getAdminByEmail(address);
    if (admin) {
      const token = await createLoginLink(admin.id);
      // The token goes in the fragment so it isn't sent to the server or kept in its logs.
      await sendLoginLinkEmail({ to: admin.email, name: admin.name, url: `${appOrigin(request)}/sign-in#token=${token}` });
    }
    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error('Error sending sign-in link:', error);
    return NextResponse.json({ error: 'Could not send the sign-in link. Try again.' }, { status: 500 });
  }
}
