'use client';

import { createContext, useContext, useEffect } from 'react';
import { Club } from '../types/pingpong';
import { DEMO_CLUB_SLUG, LAST_CLUB_COOKIE, LAST_CLUB_MAX_AGE_SECONDS } from '../lib/clubs';
import { useAuth } from './AuthProvider';

const ClubContext = createContext<Club | null>(null);

export function ClubProvider({ club, children }: { club: Club; children: React.ReactNode }) {
  // A cookie rather than local storage, because the server picks the redirect
  // at the site root. Looking at the demo doesn't make it the visitor's club.
  useEffect(() => {
    if (club.slug === DEMO_CLUB_SLUG) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LAST_CLUB_COOKIE}=${encodeURIComponent(club.slug)}; Path=/; Max-Age=${LAST_CLUB_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  }, [club.slug]);

  return <ClubContext.Provider value={club}>{children}</ClubContext.Provider>;
}

/**
 * The club being viewed. `isAdmin` and `isOwner` are about this club: an admin
 * looking at another club sees it read-only, like any visitor.
 */
export function useClub() {
  const club = useContext(ClubContext);
  if (!club) throw new Error('useClub must be used inside a club page');
  const { admin, isLoading } = useAuth();
  const isAdmin = admin?.clubId === club.id;
  const base = `/c/${club.slug}`;
  return {
    club,
    isAdmin,
    isOwner: isAdmin && admin?.role === 'owner',
    isLoading,
    /** A page in this club, e.g. clubHref('/players'). */
    clubHref: (path: string) => (path === '/' ? base : `${base}${path}`),
    /** A public read of this club's data, e.g. clubApi('/api/players'). */
    clubApi: (path: string) => `${path}?club=${encodeURIComponent(club.slug)}`,
  };
}
