import { NextRequest } from 'next/server';
import { getClubBySlug } from '../data/data';
import { Club } from '../types/pingpong';

/** The club a public read asks for with `?club=<slug>`, or null if there's no such club. */
export async function clubFromRequest(request: NextRequest): Promise<Club | null> {
  const slug = request.nextUrl.searchParams.get('club');
  return slug ? getClubBySlug(slug) : null;
}
