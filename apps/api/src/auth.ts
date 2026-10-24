import { createHmac, timingSafeEqual } from 'node:crypto';

// Demo sign-in: one account per role, shown pre-filled on the sign-in page. The session is an HMAC-signed
// role + expiry; the server checks it before any action that moves testnet funds or calls the model.
export type Role = 'business' | 'member' | 'issuer' | 'network' | 'merchant';

export const DEMO_ACCOUNTS: { email: string; role: Role; name: string; org: string }[] = [
  { email: 'cfo@demo.fluxyn.com', role: 'business', name: 'CFO', org: 'Lumen Robotics Inc.' },
  { email: 'marketing@demo.fluxyn.com', role: 'member', name: 'Marketing lead', org: 'Lumen Robotics Inc.' },
  { email: 'compliance@demo-vasp.com', role: 'issuer', name: 'Compliance officer', org: 'Demo VASP · NYC' },
  { email: 'ops@fluxyn.com', role: 'network', name: 'Network operations', org: 'Fluxyn' },
  { email: 'merchant@demo.fluxyn.com', role: 'merchant', name: 'Merchant', org: 'Flow Check reports' },
];
export const DEMO_PASSWORD = 'flowcheck-nyc';

const TTL_MS = 12 * 3600_000;
const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

export function login(email: string, password: string, key: string) {
  const account = DEMO_ACCOUNTS.find((a) => a.email === String(email).trim().toLowerCase());
  if (!account || password !== DEMO_PASSWORD) return null;
  const payload = Buffer.from(JSON.stringify({ role: account.role, exp: Date.now() + TTL_MS })).toString('base64url');
  return { token: `${payload}.${sign(payload, key)}`, ...account };
}

export function roleOf(authorization: string | undefined, key: string): Role | null {
  const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload, key);
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  try {
    const { role, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() ? (role as Role) : null;
  } catch {
    return null;
  }
}

// Caps model calls per function instance, so a public demo cannot run up the Bedrock bill
const runs: number[] = [];
export function allowAgentRun(limit = 12, windowMs = 10 * 60_000) {
  const now = Date.now();
  while (runs.length && runs[0] < now - windowMs) runs.shift();
  if (runs.length >= limit) return false;
  runs.push(now);
  return true;
}
