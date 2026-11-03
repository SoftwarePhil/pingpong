import { LOGIN_LINK_MINUTES } from '../data/admins';

const DEFAULT_FROM = 'Ping Pong <signin@pingpong.beer>';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/**
 * Emails an admin their sign-in link through Resend. Without RESEND_API_KEY,
 * development logs the link instead, and production refuses.
 */
export async function sendLoginLinkEmail({ to, name, url }: { to: string; name: string; url: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY is not set');
    console.log(`[dev] Sign-in link for ${to}: ${url}`);
    return;
  }

  const greeting = name ? `Hi ${name},` : 'Hi,';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject: 'Your ping pong sign-in link',
      text: `${greeting}\n\nSign in to manage your club:\n${url}\n\nThe link works once, for ${LOGIN_LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<p>${escapeHtml(greeting)}</p>
<p><a href="${escapeHtml(url)}">Sign in to manage your club</a></p>
<p>The link works once, for ${LOGIN_LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend refused the email (${response.status}): ${await response.text().catch(() => '')}`);
  }
}
