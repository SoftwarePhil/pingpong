import { getAdminById } from '../data/admins';
import { getClubById, getClubBySlug } from '../data/data';
import { adminIdFromToken } from './auth';

/**
 * Which club the site root should open: an admin's own club, otherwise the
 * last club this browser opened. Null means show the splash page.
 */
export async function findHomeClubSlug(sessionToken?: string, lastClubSlug?: string): Promise<string | null> {
  const adminId = adminIdFromToken(sessionToken);
  const admin = adminId ? await getAdminById(adminId) : null;
  const adminClub = admin ? await getClubById(admin.clubId) : null;
  if (adminClub) return adminClub.slug;
  // The cookie can outlive the club, so it's checked rather than trusted.
  const lastClub = lastClubSlug ? await getClubBySlug(lastClubSlug) : null;
  return lastClub?.slug ?? null;
}
