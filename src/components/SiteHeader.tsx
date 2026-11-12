'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { path: '/tournaments/active', label: 'Tournament' },
  { path: '/tournaments/history', label: 'History' },
  { path: '/players', label: 'Players' },
  { path: '/settings', label: 'Settings' },
];

/** App-wide top bar: wordmark on the left half, sections on the right half. */
export function SiteHeader() {
  const pathname = usePathname();
  // Links stay inside the club being viewed. Pages outside a club only show the wordmark.
  const clubBase = pathname.match(/^\/c\/[^/]+/)?.[0];

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href={clubBase ?? '/'} className="site-header__brand">
          <span className="site-header__ball" aria-hidden="true" />
          <span className="font-display">pingpong.beer</span>
        </Link>
        <nav aria-label="Main" className="site-header__nav">
          {clubBase && NAV_LINKS.map(link => {
            const href = `${clubBase}${link.path}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={link.path}
                href={href}
                aria-current={active ? 'page' : undefined}
                className="site-header__link"
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
