import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, ExternalLink, Landmark, LogOut, Network as NetworkIcon, Store, UserRound } from 'lucide-react';
import { getSession, NAV, ROLE_LABEL, setSession } from '../session';

// The Fluxyn app where businesses operate. Built before the hackathon.
export const BUSINESS_APP = 'https://xrplcommons.fluxyn.com';

const ROLE_ICON = { business: Building2, member: UserRound, issuer: Landmark, network: NetworkIcon, merchant: Store };

export function Shell({ children }: { children: ReactNode }) {
  const session = getSession()!;
  const nav = useNavigate();
  const signOut = () => { setSession(null); nav('/signin'); };
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const RoleIcon = ROLE_ICON[session.role];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-8 px-4 sm:px-6">
          <span className="flex shrink-0 items-center gap-2" aria-label="Fluxyn Flow Check">
            <img src="/brand/fluxyn-logo-light.png" alt="" className="h-7 w-auto" />
            <span className="hidden font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted sm:inline">Flow Check</span>
          </span>
          <nav className="flex items-center gap-0.5 overflow-x-auto" aria-label="Main">
            {NAV[session.role].map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold ${isActive ? 'bg-mint text-tealink' : 'text-muted hover:text-ink'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            {session.role === 'business' && (
              <a href={BUSINESS_APP} target="_blank" rel="noopener" className="hidden items-center gap-1.5 whitespace-nowrap border-r border-line pr-4 text-sm font-semibold text-muted hover:text-ink lg:inline-flex">
                Business app <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <div ref={menu} className="relative">
              <button onClick={() => setOpen((x) => !x)} aria-expanded={open} className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 hover:bg-sunken">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-mint text-tealink"><RoleIcon className="h-[18px] w-[18px]" /></span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-sm font-semibold">{session.org}</span>
                  <span className="block text-xs text-muted">{ROLE_LABEL[session.role]} · {session.name}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
              {open && (
                <div className="absolute right-0 top-12 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lift">
                  <div className="px-3 py-2 text-xs text-muted">{session.email}</div>
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sunken"><LogOut className="h-4 w-4" />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-muted sm:px-6">
        Fluxyn Flow Check · KYA anchored in KYB · XRPL testnet · every status on this page is read from the ledger
      </footer>
    </div>
  );
}
