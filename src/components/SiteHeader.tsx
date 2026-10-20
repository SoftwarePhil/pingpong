'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/tournaments/active', label: 'Tournament' },
  { href: '/tournaments/history', label: 'History' },
  { href: '/players', label: 'Players' },
  { href: '/settings', label: 'Settings' },
];

/** App-wide top bar: wordmark on the left half, sections on the right half. */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <span className="site-header__ball" aria-hidden="true" />
          <span className="font-display">pingpong.beer</span>
        </Link>
        <nav aria-label="Main" className="site-header__nav">
          {NAV_LINKS.map(link => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
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
