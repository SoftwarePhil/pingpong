import Link from 'next/link';
import { AuthControls } from './AuthProvider';
import { DEMO_CLUB_SLUG } from '../lib/clubs';

const FEATURES = [
  { title: 'Round robin, then bracket', body: 'Swiss, random or top-versus-top pairings lead into an elimination bracket, with byes handled for any field size.' },
  { title: 'Singles or doubles', body: 'Switch a round to doubles and teams are drawn for you. Every player still gets credit for the result.' },
  { title: 'Works on every phone', body: 'Enter scores at the table and check the standings from any browser. No app to install.' },
  { title: 'Every game on the record', body: 'Head-to-heads, rankings, past brackets and a points race across as many tournaments as you like.' },
];

function TableArt() {
  return (
    <svg className="splash__art" viewBox="0 0 800 520" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <polygon points="250,250 550,250 760,520 40,520" fill="var(--table)" />
      <polygon points="250,250 550,250 760,520 40,520" fill="none" stroke="var(--board-ink)" strokeWidth="5" />
      <line x1="400" y1="250" x2="400" y2="520" stroke="var(--board-ink)" strokeWidth="2.5" />
      <polygon points="172,352 628,352 628,312 172,312" fill="var(--board-ink)" opacity="0.2" />
      <line x1="172" y1="312" x2="628" y2="312" stroke="var(--board-ink)" strokeWidth="4" />
      <line x1="172" y1="352" x2="628" y2="352" stroke="var(--board-ink)" strokeWidth="3" />
      <path d="M 300 470 Q 420 90 560 276" fill="none" stroke="var(--board-muted)" strokeWidth="3" strokeDasharray="3 13" strokeLinecap="round" />
      <circle cx="517" cy="214" r="15" fill="var(--ball)" />
    </svg>
  );
}

/** What visitors see at the site root before they've opened a club. */
export function Splash() {
  return (
    <main className="splash">
      <section className="splash__hero">
        <TableArt />
        <div className="splash__intro">
          <p className="label-caps splash__eyebrow">Tournaments for ping pong clubs</p>
          <h1 className="font-display splash__title">Settle it at the table.</h1>
          <p className="splash__lead">
            pingpong.beer runs your club&apos;s tournaments, from the first round robin to the final, and keeps every result.
          </p>
          <Link href={`/c/${DEMO_CLUB_SLUG}`} className="button button-accent px-5 py-3 text-base">
            See the demo club →
          </Link>
        </div>
      </section>

      <section className="splash__features" aria-label="What it does">
        {FEATURES.map(feature => (
          <div key={feature.title}>
            <h2 className="font-display text-lg text-ink">{feature.title}</h2>
            <p className="mt-2 text-ink-soft">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="splash__club">
        <div>
          <h2 className="font-display text-xl text-ink">Already in a club?</h2>
          <p className="mt-2 text-ink-soft">Open your club&apos;s link once and this site will take you back there next time.</p>
        </div>
        <div className="splash__sign-in"><AuthControls /></div>
      </section>
    </main>
  );
}
