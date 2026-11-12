import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClubProvider } from '../../../components/ClubProvider';
import { getClubBySlug } from '../../../data/data';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await getClubBySlug((await params).slug);
  return club ? { title: `${club.name} · pingpong.beer`, description: club.about || undefined } : {};
}

/** Every club page lives here, so its links and data stay inside the club. */
export default async function ClubLayout({ params, children }: Props & { children: React.ReactNode }) {
  const club = await getClubBySlug((await params).slug);
  if (!club) notFound();
  return <ClubProvider club={club}>{children}</ClubProvider>;
}
