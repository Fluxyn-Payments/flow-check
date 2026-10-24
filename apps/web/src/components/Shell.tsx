import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Network', end: true },
  { to: '/workspace', label: 'Agent workspace' },
  { to: '/merchant', label: 'Merchant' },
];

// The Fluxyn app where businesses operate. Built before the hackathon.
export const BUSINESS_APP = 'https://xrplcommons.fluxyn.com';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2" aria-label="Fluxyn Flow Check">
            <img src="/brand/fluxyn-logo-light.png" alt="" className="logo-light h-6 w-auto" />
            <img src="/brand/fluxyn-logo-dark.png" alt="" className="logo-dark h-6 w-auto" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Flow Check</span>
          </Link>
          <nav className="flex items-center gap-0.5 overflow-x-auto" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-mint text-tealink' : 'text-muted hover:text-ink'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <a href={BUSINESS_APP} target="_blank" rel="noopener" className="ml-auto hidden items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-muted hover:text-ink md:inline-flex">
            Business app <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-muted sm:px-6">
        Fluxyn Flow Check · KYA anchored in KYB · XRPL testnet · every status on this page is read from the ledger
      </footer>
    </div>
  );
}
