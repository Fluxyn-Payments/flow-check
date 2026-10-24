import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut } from 'lucide-react';
import { getSession, NAV, ROLE_LABEL, setSession } from '../session';

// The Fluxyn app where businesses operate. Built before the hackathon.
export const BUSINESS_APP = 'https://xrplcommons.fluxyn.com';

export function Shell({ children }: { children: ReactNode }) {
  const session = getSession()!;
  const nav = useNavigate();
  const signOut = () => { setSession(null); nav('/signin'); };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <span className="flex shrink-0 items-center gap-2" aria-label="Fluxyn Flow Check">
            <img src="/brand/fluxyn-logo-light.png" alt="" className="h-6 w-auto" />
            <span className="hidden font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted sm:inline">Flow Check</span>
          </span>
          <nav className="flex items-center gap-0.5 overflow-x-auto" aria-label="Main">
            {NAV[session.role].map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-mint text-tealink' : 'text-muted hover:text-ink'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {session.role === 'business' && (
              <a href={BUSINESS_APP} target="_blank" rel="noopener" className="hidden items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-muted hover:text-ink lg:inline-flex">
                Business app <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-semibold">{session.org}</div>
              <div className="text-xs text-muted">{ROLE_LABEL[session.role]} · {session.name}</div>
            </div>
            <button onClick={signOut} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-muted sm:px-6">
        Fluxyn Flow Check · KYA anchored in KYB · XRPL testnet · every status on this page is read from the ledger
      </footer>
    </div>
  );
}
