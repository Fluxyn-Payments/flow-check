import { getSession } from './session';
import { useEffect, useState } from 'react';

export type Check = { id: string; label: string; ok: boolean; effect: 'DENY' | 'APPROVAL'; detail: string };

export type Issuer = { address: string; name: string; type: 'VASP' | 'PSP'; country: string; source: 'prior' | 'nyc'; issued: number };
export type AgentEntry = {
  address: string; principal: string | null; issuer: string | null;
  attested: boolean; delegated: boolean; mandate: boolean; status: 'ATTESTED' | 'DELEGATED_ONLY' | 'INCOMPLETE';
};
export type Directory = {
  issuers: Issuer[];
  businesses: { address: string; issuer: string; tier: string; agents: string[] }[];
  agents: AgentEntry[];
  counts: { issuers: number; businesses: number; agents: number; attested: number };
  profiles?: Record<string, Profile>;
};
export type Profile = { name: string; kind: 'business' | 'agent'; tag?: string; description: string; source: 'nyc' | 'prior' };
export type AgentResult = { authorized: boolean; agent: string; principal: string | null; issuer: string | null; mandateHash: string | null; checks: Check[] };
export type LedgerEvent = { hash: string; type: string; from: string; via: string | null; to: string | null; amount: string | null; result: string; date: string | null; explorer: string };

export const explorerAccount = (a: string) => `https://testnet.xrpl.org/accounts/${a}`;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getSession();
  const headers = new Headers(init?.headers);
  if (session) headers.set('authorization', `Bearer ${session.token}`);
  const r = await fetch(path, { ...init, headers });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body as T;
}

export function useApi<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then((d) => live && (setData(d), setError(null))).catch((e) => live && setError(e.message));
    const t = refreshMs ? setTimeout(() => setTick((x) => x + 1), refreshMs) : undefined;
    return () => { live = false; if (t) clearTimeout(t); };
  }, [path, refreshMs, tick]);
  return { data, error, reload: () => setTick((x) => x + 1) };
}
