import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Splash } from '../components/Splash';
import { AUTH_COOKIE } from '../lib/auth';
import { LAST_CLUB_COOKIE } from '../lib/clubs';
import { findHomeClubSlug } from '../lib/homeClub';

export const dynamic = 'force-dynamic';

/** Admins and returning visitors go to their club; everyone else sees the splash page. */
export default async function RootPage() {
  const cookieStore = await cookies();
  const slug = await findHomeClubSlug(cookieStore.get(AUTH_COOKIE)?.value, cookieStore.get(LAST_CLUB_COOKIE)?.value);
  if (slug) redirect(`/c/${slug}`);
  return <Splash />;
}
