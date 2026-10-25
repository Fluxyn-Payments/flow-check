// Demo session: the signed token the API returns at sign-in, kept in this browser
export type Role = 'business' | 'member' | 'issuer' | 'network' | 'merchant';
export type Session = { token: string; role: Role; email: string; name: string; org: string };

const KEY = 'fc-session';

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session lasts until reload */
  }
}

export const HOME: Record<Role, string> = { business: '/workspace', member: '/workspace', issuer: '/issuer', network: '/', merchant: '/merchant' };

export const NAV: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  business: [{ to: '/workspace', label: 'Agent workspace' }, { to: '/agents', label: 'Agents and budgets' }, { to: '/team', label: 'Team' }, { to: '/integrations', label: 'Integrations' }],
  member: [{ to: '/workspace', label: 'My agent' }],
  issuer: [{ to: '/issuer', label: 'Clients and agents' }, { to: '/', label: 'Network', end: true }],
  network: [{ to: '/', label: 'Network', end: true }, { to: '/issuer', label: 'Issuers' }, { to: '/merchant', label: 'Mastercard rail' }, { to: '/access', label: 'Access' }],
  merchant: [{ to: '/merchant', label: 'Payments' }],
};

export const ROLE_LABEL: Record<Role, string> = { business: 'Business', member: 'Team member', issuer: 'Issuer', network: 'Network admin', merchant: 'Merchant' };
