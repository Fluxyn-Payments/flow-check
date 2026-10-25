import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Wallet } from 'xrpl';
import { sign } from 'ripple-keypairs';
import { canonical, sha256Hex, toHex, type FlowCheck, type Mandate, type MandateSet, type SignedMandate } from '@fluxyn/flow-check';
import type { State } from './app.js';
import { agentOf, type AgentKey } from './agent.js';
import { DEMO_ACCOUNTS } from './auth.js';

// The CFO administers the business's agents: edits Mandates (a new signed version anchored on the ledger),
// pauses or restores the delegation, chooses rails and channels per agent, and manages the team.
const s3 = new S3Client({});
const bucket = () => process.env.DATA_BUCKET;

async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return JSON.parse(await r.Body!.transformToString()) as T;
  } catch {
    return fallback;
  }
}
const putJson = (key: string, data: unknown) => s3.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: JSON.stringify(data), ContentType: 'application/json' }));

// Mandates published after setup live in S3 and are merged into the state once per container
type Overlay = { mandates: Record<string, SignedMandate>; mandateSets: Record<string, MandateSet>; agentMandate: Partial<Record<AgentKey, string>>; mandateSetHash?: string };
let loaded = false;
export async function loadOverlay(state: State) {
  if (loaded || !bucket()) return;
  const o = await getJson<Overlay>('overlay.json', { mandates: {}, mandateSets: {}, agentMandate: {} });
  applyOverlay(state, o);
  loaded = true;
}
function applyOverlay(state: State, o: Overlay) {
  Object.assign(state.mandates, o.mandates);
  state.mandateSets = { ...(state.mandateSets ?? {}), ...o.mandateSets };
  if (o.agentMandate.payables) state.mandateHash = o.agentMandate.payables;
  if (o.agentMandate.marketing && state.agents?.marketing) state.agents.marketing.mandateHash = o.agentMandate.marketing;
  if (o.mandateSetHash) state.mandateSetHash = o.mandateSetHash;
}

export type MandatePatch = { perPayment?: number; daily?: number; monthly?: number; quarterly?: number | null; categories?: string[] | null };

// A new Mandate version: signed by the business, its hash anchored on the agent's DID and in the business's Mandate set
export async function updateMandate(fc: FlowCheck, state: State, key: AgentKey, patch: MandatePatch) {
  const a = agentOf(state, key);
  const current = state.mandates[a.mandateHash];
  if (!current) throw new Error('current Mandate not found');
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : fallback);
  const old = current.mandate;
  const limits = { ...old.limits, perPayment: num(patch.perPayment, old.limits.perPayment), daily: num(patch.daily, old.limits.daily), monthly: num(patch.monthly, old.limits.monthly) };
  if (patch.quarterly === null) delete (limits as { quarterly?: number }).quarterly;
  else if (patch.quarterly !== undefined) limits.quarterly = num(patch.quarterly, old.limits.quarterly ?? 0);
  const categories = patch.categories === null ? undefined : patch.categories ? patch.categories.map((c) => String(c).trim().toLowerCase()).filter(Boolean).slice(0, 12) : old.categories;
  const mandate: Mandate = { ...old, version: old.version + 1, limits, issuedAt: new Date().toISOString() };
  if (categories?.length) mandate.categories = categories; else delete mandate.categories;

  const business = Wallet.fromSeed(state.business.seed);
  const agent = Wallet.fromSeed(a.seed);
  const hash = sha256Hex(canonical(mandate));
  const signed: SignedMandate = { mandate, signature: sign(hash, business.privateKey), publicKey: business.publicKey };
  const txs: { label: string; engineResult: string; explorer: string }[] = [];
  const submit = async (label: string, tx: any, w: Wallet) => {
    const r = await fc.client.submitAndWait(tx, { wallet: w, autofill: true });
    const code = (r.result.meta as any)?.TransactionResult as string;
    txs.push({ label, engineResult: code, explorer: fc.txUrl(r.result.hash) });
    if (code !== 'tesSUCCESS') throw new Error(`${label}: ${code}`);
  };
  await submit('Agent DID → new Mandate', { TransactionType: 'DIDSet', Account: agent.address, Data: hash, URI: toHex(`flowcheck:mandate:${hash}`) }, agent);

  const agents: Record<string, string> = { [state.agent.address]: key === 'payables' ? hash : state.mandateHash };
  if (state.agents?.marketing) agents[state.agents.marketing.address] = key === 'marketing' ? hash : state.agents.marketing.mandateHash;
  const set: MandateSet = { schema: 'flowcheck.mandate-set/v1', principal: business.address, agents, issuedAt: new Date().toISOString() };
  const setHash = sha256Hex(canonical(set));
  await submit('Business DID → Mandate set', { TransactionType: 'DIDSet', Account: business.address, Data: setHash, URI: toHex(`flowcheck:mandate-set:${setHash}`) }, business);

  const o = await getJson<Overlay>('overlay.json', { mandates: {}, mandateSets: {}, agentMandate: {} });
  o.mandates[hash] = signed;
  o.mandateSets[setHash] = set;
  o.agentMandate[key] = hash;
  o.mandateSetHash = setHash;
  await putJson('overlay.json', o);
  applyOverlay(state, o);
  return { version: mandate.version, hash, mandate, txs };
}

// Pause (remove the Payment delegation) or restore it: the ledger stops or resumes the agent's payments
export async function setDelegation(fc: FlowCheck, state: State, key: AgentKey, enabled: boolean) {
  const business = Wallet.fromSeed(state.business.seed);
  const agent = agentOf(state, key).address;
  const tx: any = { TransactionType: 'DelegateSet', Account: business.address, Authorize: agent, Permissions: enabled ? [{ Permission: { PermissionValue: 'Payment' } }] : [] };
  const r = await fc.client.submitAndWait(tx, { wallet: business, autofill: true });
  const engineResult = (r.result.meta as any)?.TransactionResult as string;
  return { enabled, engineResult, explorer: fc.txUrl(r.result.hash) };
}

// Rails and channels the CFO enables per agent. Enforced by the API: payments, MCP, widget and REST access.
export type AgentConfig = { rails: { xrpl: boolean; ap4m: boolean; ripple: boolean }; channels: { mcp: boolean; widget: boolean; api: boolean } };
const DEFAULT_CONFIG: AgentConfig = { rails: { xrpl: true, ap4m: true, ripple: true }, channels: { mcp: true, widget: true, api: true } };
const cache: Partial<Record<AgentKey, { at: number; c: AgentConfig }>> = {};

export async function getAgentConfig(key: AgentKey): Promise<AgentConfig> {
  const hit = cache[key];
  if (hit && Date.now() - hit.at < 5000) return hit.c;
  const c = bucket() ? await getJson<AgentConfig>(`agent-config/${key}.json`, DEFAULT_CONFIG) : DEFAULT_CONFIG;
  const merged = { rails: { ...DEFAULT_CONFIG.rails, ...c.rails }, channels: { ...DEFAULT_CONFIG.channels, ...c.channels } };
  cache[key] = { at: Date.now(), c: merged };
  return merged;
}

export async function putAgentConfig(key: AgentKey, input: Partial<AgentConfig>) {
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const cur = await getAgentConfig(key);
  const c: AgentConfig = {
    rails: { xrpl: bool(input.rails?.xrpl, cur.rails.xrpl), ap4m: bool(input.rails?.ap4m, cur.rails.ap4m), ripple: bool(input.rails?.ripple, cur.rails.ripple) },
    channels: { mcp: bool(input.channels?.mcp, cur.channels.mcp), widget: bool(input.channels?.widget, cur.channels.widget), api: bool(input.channels?.api, cur.channels.api) },
  };
  await putJson(`agent-config/${key}.json`, c);
  cache[key] = { at: Date.now(), c };
  return c;
}

// The team: who operates which agent. Invitations are stored; the demo accounts sign in with the shared password.
export type TeamUser = { email: string; name: string; role: 'Admin (CFO)' | 'Agent operator' | 'Viewer'; agents: AgentKey[]; status: 'active' | 'invited' };
export async function team(): Promise<TeamUser[]> {
  const base: TeamUser[] = DEMO_ACCOUNTS.filter((a) => a.role === 'business' || a.role === 'member').map((a) => ({
    email: a.email, name: a.name, role: a.role === 'business' ? 'Admin (CFO)' : 'Agent operator', agents: a.role === 'business' ? ['payables', 'marketing'] : ['marketing'], status: 'active',
  }));
  const invited = bucket() ? await getJson<TeamUser[]>('users.json', []) : [];
  return [...base, ...invited];
}

export async function invite(input: { email?: string; name?: string; role?: string; agents?: string[] }) {
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('enter a valid email');
  const invited = await getJson<TeamUser[]>('users.json', []);
  if (invited.some((u) => u.email === email) || DEMO_ACCOUNTS.some((a) => a.email === email)) throw new Error('already on the team');
  const user: TeamUser = {
    email, name: String(input.name ?? '').slice(0, 80) || email.split('@')[0],
    role: input.role === 'Viewer' ? 'Viewer' : 'Agent operator',
    agents: (input.agents ?? []).filter((k): k is AgentKey => k === 'payables' || k === 'marketing'), status: 'invited',
  };
  await putJson('users.json', [...invited, user].slice(-50));
  return user;
}

export async function removeInvite(email: string) {
  const invited = await getJson<TeamUser[]>('users.json', []);
  await putJson('users.json', invited.filter((u) => u.email !== email.toLowerCase()));
}
