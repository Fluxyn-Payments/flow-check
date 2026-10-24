import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Wallet, type Payment } from 'xrpl';
import { FlowCheck, type MandateSet, type SignedMandate } from '@fluxyn/flow-check';
import { MONITOR_HTML } from './monitor.js';
import { directory, PRIOR_ISSUERS, type Issuer } from './directory.js';
import { agentOf, bills, runAgent, type AgentKey } from './agent.js';
import { ap4mState, overCapAttempt } from './ap4m.js';
import { allowAgentRun, DEMO_ACCOUNTS, DEMO_PASSWORD, login, roleOf, type Role } from './auth.js';
import { attestAgent, issuerView, revokeAgent } from './issuer.js';
import { profiles } from './profiles.js';
import { getKnowledge, putKnowledge } from './knowledge.js';
import { approveBatch } from './batch.js';
import { DOCS_HTML, openapi, postmanCollection } from './openapi.js';

// Network state as written by `pnpm setup:testnet`, plus the published Mandates
export type State = {
  network: 'testnet';
  issuers: { vasp: { address: string; seed: string }; psp: { address: string; seed: string } };
  rlusdIssuer: { address: string; seed: string };
  business: { address: string; seed: string };
  agent: { address: string; seed: string };
  suppliers: { a: { address: string; seed: string }; b: { address: string; seed: string } };
  vendor: { address: string; seed: string };
  rogue: { address: string; seed: string };
  mandateHash: string;
  mandates: Record<string, SignedMandate>;
  ap4m?: { agentKey: string };
  agents?: { marketing?: { address: string; seed: string; mandateHash: string } };
  mandateSetHash?: string;
  mandateSets?: Record<string, MandateSet>;
};

export type Req = { method: string; path: string; body: any; headers: Record<string, string | undefined> };
export type Res = { status: number; body: string; headers: Record<string, string>; base64?: boolean };

const json = (status: number, data: unknown): Res => ({ status, body: JSON.stringify(data), headers: { 'content-type': 'application/json' } });

// The web app (apps/web build) is bundled next to the function. Unknown paths fall back to index.html.
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
async function webFile(path: string): Promise<Res> {
  const root = process.env.WEB_DIR ?? join(process.cwd(), 'web');
  const rel = normalize(path).replace(/^(\.\.[/\\])+/, '').replace(/^\/+/, '') || 'index.html';
  for (const file of [join(root, rel), join(root, 'index.html')]) {
    try {
      const buf = await readFile(file);
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      const text = type.startsWith('text/') || type.includes('svg');
      const cache = file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      return { status: 200, body: text ? buf.toString('utf8') : buf.toString('base64'), base64: !text, headers: { 'content-type': type, 'cache-control': cache } };
    } catch { /* try the next one */ }
  }
  return { status: 404, body: 'Not found', headers: { 'content-type': 'text/plain' } };
}

// Mandates published by other apps on the network (for example the Fluxyn app) live behind their DID URI
async function fetchMandate(uri: string): Promise<SignedMandate | null> {
  try {
    const r = await fetch(uri, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const b = await r.json();
    const mandate = b.mandate ?? b.document;
    return mandate && b.signature && b.publicKey ? { mandate, signature: b.signature, publicKey: b.publicKey } : null;
  } catch {
    return null;
  }
}

// Every issuer on the network: the ones built in NYC plus the ones from the Fluxyn app (prior work)
export const networkIssuers = (s: State): Issuer[] => [
  { address: s.issuers.vasp.address, name: 'Demo VASP · NYC', type: 'VASP', country: 'US', source: 'nyc' },
  { address: s.issuers.psp.address, name: 'Demo PSP · NYC', type: 'PSP', country: 'US', source: 'nyc' },
  ...PRIOR_ISSUERS,
];

// Public view of the network: addresses and roles, never seeds
const publicNetwork = (s: State) => ({
  network: s.network,
  issuers: { vasp: s.issuers.vasp.address, psp: s.issuers.psp.address },
  rlusdIssuer: s.rlusdIssuer.address,
  business: s.business.address,
  agent: s.agent.address,
  suppliers: { a: s.suppliers.a.address, b: s.suppliers.b.address },
  vendor: s.vendor.address,
  rogue: s.rogue.address,
  mandateHash: s.mandateHash,
});

export async function handle(req: Req, state: State, demoToken: string | undefined): Promise<Res> {
  if (req.method === 'GET' && req.path === '/monitor') {
    return { status: 200, body: MONITOR_HTML, headers: { 'content-type': 'text/html; charset=utf-8' } };
  }
  if (req.method === 'GET' && req.path === '/api/openapi.json') return json(200, openapi);
  if (req.method === 'GET' && req.path === '/api/docs') return { status: 200, body: DOCS_HTML, headers: { 'content-type': 'text/html; charset=utf-8' } };
  if (req.method === 'GET' && req.path === '/api/postman.json') {
    const base = req.headers['host'] ? `https://${req.headers['host']}` : openapi.servers[0].url;
    return { status: 200, body: JSON.stringify(postmanCollection(base), null, 2), headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="flow-check.postman_collection.json"' } };
  }
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return webFile(req.path);

  const issuers = networkIssuers(state);
  const fc = new FlowCheck({
    network: 'testnet',
    issuers: issuers.map((i) => i.address),
    resolveMandate: async (hash, uri) => state.mandates[hash] ?? (uri?.startsWith('https://') ? fetchMandate(uri) : null),
    resolveMandateSet: async (hash) => state.mandateSets?.[hash] ?? null,
  });
  await fc.connect();
  try {
    const parts = req.path.split('/').filter(Boolean);
    const key = demoToken ?? '';
    const role = roleOf(req.headers['authorization'], key);
    // Actions that move testnet funds or call the model need a signed-in role (or the operator's demo token)
    const can = (...roles: Role[]) => !!key && (req.headers['x-demo-token'] === key || (role !== null && roles.includes(role)));

    if (req.method === 'GET' && req.path === '/api/demo-accounts') return json(200, { accounts: DEMO_ACCOUNTS, password: DEMO_PASSWORD });
    if (req.method === 'POST' && req.path === '/api/login') {
      const session = key ? login(req.body?.email, req.body?.password, key) : null;
      return session ? json(200, session) : json(401, { error: 'wrong email or password' });
    }
    if (req.method === 'GET' && req.path === '/api/issuer') return json(200, await issuerView(fc, state));
    if (req.method === 'POST' && req.path === '/api/issuer/revoke') {
      if (!can('issuer')) return json(401, { error: 'sign in as the issuer' });
      return json(200, await revokeAgent(fc, state, String(req.body?.agent ?? state.agent.address)));
    }
    if (req.method === 'POST' && req.path === '/api/issuer/attest') {
      if (!can('issuer')) return json(401, { error: 'sign in as the issuer' });
      return json(200, await attestAgent(fc, state));
    }

    if (req.method === 'GET' && req.path === '/api/network') return json(200, publicNetwork(state));
    if (req.method === 'GET' && req.path === '/api/directory') return json(200, { ...(await directory(fc, issuers)), profiles: profiles(state) });
    if (req.method === 'GET' && req.path === '/api/profiles') return json(200, profiles(state));
    if (req.method === 'GET' && parts[1] === 'agent' && parts[2]) return json(200, await fc.verifyAgent(parts[2]));
    if (req.method === 'GET' && parts[1] === 'pass' && parts[2]) return json(200, await fc.verifyPass(parts[2]));
    if (req.method === 'POST' && req.path === '/api/check') {
      const { agent, amount, currency, destination, category } = req.body ?? {};
      return json(200, await fc.checkMandate(agent, { amount: Number(amount), currency, destination, category }));
    }
    if (req.method === 'GET' && req.path === '/api/events') return json(200, await events(fc, state, [state.business.address, state.rogue.address]));
    if (req.method === 'GET' && parts[1] === 'activity' && parts[2]) return json(200, await events(fc, state, [parts[2]]));

    // Which agent the signed-in user works with: team members only see their own agent
    const myAgent: AgentKey = role === 'member' ? 'marketing' : 'payables';
    if (req.method === 'GET' && req.path === '/api/bills') return json(200, bills(state, myAgent));
    if (req.method === 'GET' && req.path === '/api/me') {
      const a = agentOf(state, myAgent);
      return json(200, { role, agent: a.address, agentKey: myAgent, business: state.business.address, canApprove: role === 'business' });
    }
    // Agent context: the CFO writes it; team members can read their own agent's
    if (parts[1] === 'agents' && (parts[2] === 'payables' || parts[2] === 'marketing') && parts[3] === 'knowledge') {
      const k = parts[2] as AgentKey;
      if (req.method === 'GET') {
        if (!can('business') && !(role === 'member' && k === myAgent)) return json(401, { error: 'sign in as the business' });
        return json(200, await getKnowledge(k));
      }
      if (req.method === 'PUT') {
        if (!can('business')) return json(401, { error: 'only the CFO can change what the agent knows' });
        return json(200, await putKnowledge(k, req.body ?? {}));
      }
    }
    if (req.method === 'POST' && req.path === '/api/business/approve-batch') {
      if (!can('business')) return json(401, { error: 'only the CFO approves' });
      const key: AgentKey = req.body?.agent === 'marketing' ? 'marketing' : 'payables';
      return json(200, await approveBatch(fc, state, key, Array.isArray(req.body?.bills) ? req.body.bills.map(String) : []));
    }
    if (req.method === 'GET' && req.path === '/api/business/agents') {
      const keys: AgentKey[] = state.agents?.marketing ? ['payables', 'marketing'] : ['payables'];
      return json(200, await Promise.all(keys.map(async (k) => {
        const a = agentOf(state, k);
        const kya = await fc.verifyAgent(a.address);
        const signed = kya.mandateHash ? state.mandates[kya.mandateHash] : null;
        return { key: k, address: a.address, authorized: kya.authorized, evm: kya.evm, mandate: signed?.mandate ?? null, spent: signed ? await fc.spent(signed.mandate.principal, a.address) : null };
      })));
    }
    if (req.method === 'GET' && parts[1] === 'mandates' && parts[2] === 'hash' && parts[3]) {
      const m = state.mandates[parts[3].toUpperCase()];
      return m ? json(200, m) : json(404, { error: 'unknown mandate' });
    }
    if (req.method === 'GET' && req.path === '/api/ap4m') return json(200, await ap4mState(state.ap4m?.agentKey));
    if (req.method === 'GET' && parts[1] === 'mandate' && parts[2]) {
      const kya = await fc.verifyAgent(parts[2]);
      const signed = kya.mandateHash ? state.mandates[kya.mandateHash] ?? null : null;
      const spent = signed ? await fc.spent(signed.mandate.principal, parts[2]) : null;
      return json(200, { hash: kya.mandateHash, mandate: signed?.mandate ?? null, spent });
    }

    if (req.method === 'POST' && req.path === '/api/ap4m/over-cap') return json(200, await overCapAttempt(state.ap4m?.agentKey));

    // The agent moves testnet funds: only with the demo token
    if (req.method === 'POST' && req.path === '/api/agent/run') {
      if (!can('business', 'member')) return json(401, { error: 'sign in as the business' });
      if (!allowAgentRun()) return json(429, { error: 'the demo agent is busy, try again in a few minutes' });
      const message = String(req.body?.message ?? '').slice(0, 2000) || "Pay this month's bills.";
      return json(200, await runAgent(fc, state, message, myAgent));
    }

    // Demo scenes move testnet funds: only with the demo token
    if (req.method === 'POST' && parts[1] === 'demo' && parts[2]) {
      if (!can('business')) return json(401, { error: 'sign in as the business' });
      return json(200, await scene(fc, state, parts[2]));
    }
    return json(404, { error: 'not found' });
  } finally {
    await fc.disconnect();
  }
}

async function scene(fc: FlowCheck, s: State, id: string) {
  const agent = Wallet.fromSeed(s.agent.seed);
  const RLUSD = { currency: 'RLUSD', tokenIssuer: s.rlusdIssuer.address };
  switch (id) {
    case '1':
      return fc.payWithPass({ agent, destination: s.suppliers.a.address, amount: 1200, ...RLUSD });
    case '2':
      return fc.payWithPass({ agent, destination: s.suppliers.b.address, amount: 6000, ...RLUSD });
    case '2-approve': {
      // Human approval: the business signs the pending payment (the Ledger device in the live demo)
      const r = await fc.payWithPass({ agent, destination: s.suppliers.b.address, amount: 6000, ...RLUSD });
      if (!r.pendingTx) return r;
      const { Delegate, ...tx } = r.pendingTx as Payment & { Delegate?: string };
      const res = await fc.client.submitAndWait(tx as Payment, { wallet: Wallet.fromSeed(s.business.seed), autofill: true });
      const engineResult = (res.result.meta as any)?.TransactionResult;
      return { ...r, status: engineResult === 'tesSUCCESS' ? 'PAID' : 'FAILED', approval: 'SIMULATED: signed with the business key on the server', approvedBy: s.business.address, hash: res.result.hash, engineResult, explorer: fc.txUrl(res.result.hash) };
    }
    case '3a':
      return fc.payWithPass({ agent, destination: s.vendor.address, amount: 300, ...RLUSD });
    case '3b': {
      const rogue = Wallet.fromSeed(s.rogue.seed);
      const kya = await fc.verifyAgent(rogue.address);
      const tx = await fc.client.autofill({ TransactionType: 'Payment', Account: rogue.address, Destination: s.suppliers.a.address, Amount: '10000000' });
      const res = await fc.client.submitAndWait(rogue.sign(tx).tx_blob).catch((e: any) => e);
      const engineResult = res?.result?.meta?.TransactionResult ?? res?.data?.engine_result ?? 'error';
      const hash = res?.result?.hash;
      return { status: 'REFUSED_BY_LEDGER', kya, engineResult, hash, explorer: hash ? fc.txUrl(hash) : null };
    }
    default:
      return { error: `unknown scene ${id}` };
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const amountOf = (a: any) => (a == null ? null : typeof a === 'object' ? `${a.value} RLUSD` : `${Number(a) / 1e6} XRP`);

// Recent transactions touching the demo accounts, newest first
async function events(fc: FlowCheck, s: State, accounts: string[]) {
  const names: Record<string, string> = {
    [s.business.address]: 'business', [s.agent.address]: 'agent', [s.suppliers.a.address]: 'supplier A',
    [s.suppliers.b.address]: 'supplier B', [s.vendor.address]: 'vendor', [s.rogue.address]: 'rogue agent',
    [s.issuers.vasp.address]: 'issuer VASP', [s.issuers.psp.address]: 'issuer PSP', [s.rlusdIssuer.address]: 'RLUSD issuer',
  };
  const seen = new Map<string, any>();
  for (const account of accounts) {
    const r = await fc.client.request({ command: 'account_tx', account, limit: 15 } as any);
    for (const t of (r.result as any).transactions) {
      const tx = t.tx_json ?? t.tx;
      const hash = t.hash ?? tx.hash;
      seen.set(hash, {
        hash,
        type: tx.TransactionType,
        from: names[tx.Account] ?? short(tx.Account),
        via: tx.Delegate ? names[tx.Delegate] ?? short(tx.Delegate) : null,
        to: tx.Destination ? names[tx.Destination] ?? short(tx.Destination) : null,
        amount: amountOf(tx.DeliverMax ?? tx.Amount),
        result: t.meta?.TransactionResult,
        date: tx.date ? new Date((tx.date + 946684800) * 1000).toISOString() : null,
        explorer: fc.txUrl(hash),
      });
    }
  }
  return [...seen.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}
