import { fromHex, type FlowCheck } from '@fluxyn/flow-check';

// Issuers on the Flow Check network. The ones marked "prior" were created before the hackathon
// in the Fluxyn app; the "nyc" ones by setup-testnet. Addresses are public testnet accounts.
export type Issuer = { address: string; name: string; type: 'VASP' | 'PSP'; country: string; source: 'prior' | 'nyc' };

export const PRIOR_ISSUERS: Issuer[] = [
  { address: 'rHUAfNTu4r6dp9pUkccF2yhuPcWvgpi38n', name: 'Fluxyn S.A.', type: 'VASP', country: 'AR', source: 'prior' },
  { address: 'rag7jE1ZNRAXNnjBnDesNLKYeCuZ82WCzU', name: 'PSP Demo Argentina', type: 'PSP', country: 'AR', source: 'prior' },
  { address: 'r9qXaeXEWeVand9eBQi7k8oGG2um38yixW', name: 'VASP Demo Brasil', type: 'VASP', country: 'BR', source: 'prior' },
];

type Issued = { issuer: string; subject: string; type: string; accepted: boolean; uri: string | null };

export type AgentEntry = {
  address: string;
  principal: string | null;
  issuer: string | null;
  attested: boolean;     // holds AGENT_AUTHORIZED
  delegated: boolean;    // the business delegated Payment to it
  mandate: boolean;      // a Mandate hash is anchored on its account
  status: 'ATTESTED' | 'DELEGATED_ONLY' | 'INCOMPLETE';
};

export type Directory = {
  issuers: (Issuer & { issued: number })[];
  businesses: { address: string; issuer: string; tier: string; agents: string[] }[];
  agents: AgentEntry[];
  counts: { issuers: number; businesses: number; agents: number; attested: number };
};

const lsfAccepted = 0x00010000;

async function issuedBy(fc: FlowCheck, issuer: string): Promise<Issued[]> {
  const out: Issued[] = [];
  let marker: unknown;
  do {
    const r: any = await fc.client.request({ command: 'account_objects', account: issuer, type: 'credential', limit: 400, marker } as any).catch(() => null);
    if (!r) break;
    for (const o of r.result.account_objects) {
      if (o.Issuer !== issuer) continue;
      out.push({ issuer, subject: o.Subject, type: fromHex(o.CredentialType), accepted: (o.Flags & lsfAccepted) !== 0, uri: o.URI ? fromHex(o.URI) : null });
    }
    marker = r.result.marker;
  } while (marker);
  return out;
}

async function delegatesOf(fc: FlowCheck, account: string): Promise<string[]> {
  const r: any = await fc.client.request({ command: 'account_objects', account, type: 'delegate' } as any).catch(() => null);
  return r ? r.result.account_objects.filter((o: any) => (o.Permissions ?? []).some((p: any) => p.Permission?.PermissionValue === 'Payment')).map((o: any) => o.Authorize) : [];
}

async function hasDid(fc: FlowCheck, account: string): Promise<boolean> {
  const r: any = await fc.client.request({ command: 'ledger_entry', did: account } as any).catch(() => null);
  return !!r?.result?.node?.Data;
}

// The whole network, read from the ledger: issuers → businesses (Pass) → agents (KYA, delegation, Mandate)
export async function directory(fc: FlowCheck, issuers: Issuer[]): Promise<Directory> {
  const all = (await Promise.all(issuers.map((i) => issuedBy(fc, i.address)))).flat().filter((c) => c.accepted);

  const businesses = new Map<string, { address: string; issuer: string; tier: string; agents: string[] }>();
  for (const c of all.filter((c) => c.type.startsWith('KYB_'))) {
    const prev = businesses.get(c.subject);
    if (!prev || c.type === 'KYB_VERIFIED') businesses.set(c.subject, { address: c.subject, issuer: c.issuer, tier: c.type, agents: [] });
  }

  const attestations = new Map(all.filter((c) => c.type === 'AGENT_AUTHORIZED').map((c) => [c.subject, c]));
  const agents = new Map<string, AgentEntry>();

  await Promise.all([...businesses.values()].map(async (b) => {
    for (const a of await delegatesOf(fc, b.address)) {
      b.agents.push(a);
      agents.set(a, { address: a, principal: b.address, issuer: null, attested: false, delegated: true, mandate: false, status: 'INCOMPLETE' });
    }
  }));
  for (const [subject, c] of attestations) {
    const principal = c.uri?.match(/principal:(r[1-9A-HJ-NP-Za-km-z]{24,34})/)?.[1] ?? null;
    const prev = agents.get(subject);
    agents.set(subject, { ...(prev ?? { address: subject, principal, delegated: false, mandate: false, status: 'INCOMPLETE' }), principal: prev?.principal ?? principal, issuer: c.issuer, attested: true } as AgentEntry);
  }
  await Promise.all([...agents.values()].map(async (a) => {
    a.mandate = await hasDid(fc, a.address);
    a.status = a.attested && a.delegated && a.mandate ? 'ATTESTED' : a.delegated && a.mandate ? 'DELEGATED_ONLY' : 'INCOMPLETE';
  }));

  const list = [...agents.values()].sort((x, y) => Number(y.attested) - Number(x.attested));
  return {
    issuers: issuers.map((i) => ({ ...i, issued: all.filter((c) => c.issuer === i.address).length })),
    businesses: [...businesses.values()],
    agents: list,
    counts: { issuers: issuers.length, businesses: businesses.size, agents: list.length, attested: list.filter((a) => a.attested).length },
  };
}
