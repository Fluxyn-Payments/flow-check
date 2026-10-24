import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client, type Payment, type Wallet } from 'xrpl';
import { deriveAddress, verify } from 'ripple-keypairs';
import { canonical, currencyCode, fromHex, sha256Hex, toHex } from './encoding.js';
import type {
  AgentResult, Check, CredentialInfo, CredentialType, MandateResult, MandateSet, PassResult, PaymentRequest, SignedMandate, Usage,
} from './types.js';

export * from './types.js';
export { canonical, sha256Hex, toHex, fromHex, currencyCode } from './encoding.js';

const NETWORKS: Record<string, { ws: string; explorer: string }> = {
  testnet: { ws: 'wss://s.altnet.rippletest.net:51233', explorer: 'https://testnet.xrpl.org' },
  devnet: { ws: 'wss://s.devnet.rippletest.net:51233', explorer: 'https://devnet.xrpl.org' },
  mainnet: { ws: 'wss://xrplcluster.com', explorer: 'https://livenet.xrpl.org' },
};

const lsfAccepted = 0x00010000;
const RIPPLE_EPOCH = 946684800;

export type FlowCheckOptions = {
  network?: keyof typeof NETWORKS;
  /** Issuer accounts that belong to the network (licensed PSPs and VASPs). */
  issuers: string[];
  /** Finds the published Mandate for an anchored hash. Defaults to https fetch, or a local folder. */
  resolveMandate?: (hash: string, uri: string | null) => Promise<SignedMandate | null>;
  mandateDir?: string;
  /** Finds the business's Mandate set (one current Mandate per agent) for the hash anchored on its account. */
  resolveMandateSet?: (hash: string, uri: string | null) => Promise<MandateSet | null>;
  /** USD value of one unit of each currency. RLUSD and USD are 1. */
  rates?: Record<string, number>;
};

export type PayParams = PaymentRequest & {
  agent: Wallet;
  /** Issuer of the token being paid (for RLUSD). Omit for XRP. */
  tokenIssuer?: string;
  usage?: Usage;
};

export type PayResult = MandateResult & {
  status: 'PAID' | 'PENDING_APPROVAL' | 'REFUSED' | 'FAILED';
  /** Prepared transaction for a human to sign when status is PENDING_APPROVAL. */
  pendingTx?: Payment;
  hash?: string;
  engineResult?: string;
  explorer?: string;
};

// The agent credential's URI: flowcheck:agent:principal:<business account>[:evm:<0x address>]
export function agentBinding(uri: string | null): { principal: string | null; evm: string | null } {
  const m = uri?.match(/^flowcheck:agent:principal:(r[1-9A-HJ-NP-Za-km-z]{24,34})(?::evm:(0x[0-9a-fA-F]{40}))?$/);
  return { principal: m?.[1] ?? null, evm: m?.[2] ?? null };
}

const fromCurrency = (code: string) => (code.length === 40 ? fromHex(code).replace(/\0+$/, '') : code);

export class FlowCheck {
  readonly client: Client;
  readonly explorer: string;
  private readonly opts: FlowCheckOptions;

  constructor(opts: FlowCheckOptions) {
    const net = NETWORKS[opts.network ?? 'testnet'];
    this.client = new Client(net.ws);
    this.explorer = net.explorer;
    this.opts = opts;
  }

  connect() { return this.client.isConnected() ? Promise.resolve() : this.client.connect(); }
  disconnect() { return this.client.disconnect(); }
  txUrl(hash: string) { return `${this.explorer}/transactions/${hash}`; }

  // ---------- ledger reads ----------

  async credentials(subject: string): Promise<CredentialInfo[]> {
    const r = await this.client.request({ command: 'account_objects', account: subject, type: 'credential' } as any);
    const now = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
    return ((r.result as any).account_objects as any[])
      .filter((o) => o.Subject === subject)
      .map((o) => ({
        issuer: o.Issuer,
        type: fromHex(o.CredentialType) as CredentialType,
        accepted: (o.Flags & lsfAccepted) !== 0,
        expired: o.Expiration !== undefined && o.Expiration <= now,
        index: o.index,
        uri: o.URI ? fromHex(o.URI) : null,
      }));
  }

  private async findCredential(subject: string, types: CredentialType[]) {
    const all = await this.credentials(subject);
    return all.find((c) => types.includes(c.type) && this.opts.issuers.includes(c.issuer) && c.accepted && !c.expired) ?? null;
  }

  private async didHash(account: string): Promise<{ hash: string | null; uri: string | null }> {
    try {
      const r = await this.client.request({ command: 'ledger_entry', did: account } as any);
      const node = (r.result as any).node;
      return { hash: node?.Data ? String(node.Data).toUpperCase() : null, uri: node?.URI ? fromHex(node.URI) : null };
    } catch {
      return { hash: null, uri: null };
    }
  }

  private async hasDelegation(principal: string, agent: string, permission: string) {
    const r = await this.client.request({ command: 'account_objects', account: principal, type: 'delegate' } as any);
    return ((r.result as any).account_objects as any[]).some(
      (o) => o.Authorize === agent && (o.Permissions ?? []).some((p: any) => p.Permission?.PermissionValue === permission),
    );
  }

  private async loadMandate(hash: string, uri: string | null): Promise<SignedMandate | null> {
    if (this.opts.resolveMandate) return this.opts.resolveMandate(hash, uri);
    try {
      if (uri?.startsWith('https://')) {
        const res = await fetch(uri);
        return res.ok ? ((await res.json()) as SignedMandate) : null;
      }
      const dir = this.opts.mandateDir ?? '.flowcheck/mandates';
      return JSON.parse(await readFile(join(dir, `${hash}.json`), 'utf8')) as SignedMandate;
    } catch {
      return null;
    }
  }

  /** What the agent already paid for the business today and this month (UTC), in USD, read from the ledger. */
  async spent(principal: string, agent: string): Promise<Usage> {
    const rates = this.opts.rates ?? { USD: 1, RLUSD: 1 };
    const now = new Date();
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const quarterStart = Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1);
    const usage: Usage = { today: 0, month: 0, quarter: 0 };
    let marker: unknown;
    for (let page = 0; page < 5; page++) {
      const r: any = await this.client.request({ command: 'account_tx', account: principal, limit: 200, forward: false, marker } as any);
      let older = false;
      for (const t of r.result.transactions) {
        const tx = t.tx_json ?? t.tx;
        const when = tx.date !== undefined ? (tx.date + RIPPLE_EPOCH) * 1000 : 0;
        if (when < quarterStart) { older = true; continue; }
        if (tx.TransactionType !== 'Payment' || tx.Account !== principal || tx.Delegate !== agent || t.meta?.TransactionResult !== 'tesSUCCESS') continue;
        const amt = t.meta?.delivered_amount ?? tx.DeliverMax ?? tx.Amount;
        const usd = typeof amt === 'string' ? (Number(amt) / 1e6) * (rates.XRP ?? NaN) : Number(amt.value) * (rates[fromCurrency(amt.currency)] ?? NaN);
        if (!Number.isFinite(usd)) continue;
        usage.quarter! += usd;
        if (when >= monthStart) usage.month += usd;
        if (when >= dayStart) usage.today += usd;
      }
      marker = r.result.marker;
      if (older || !marker) break;
    }
    return { today: Number(usage.today.toFixed(2)), month: Number(usage.month.toFixed(2)), quarter: Number(usage.quarter!.toFixed(2)) };
  }

  // ---------- Flow Check ----------

  /** Does this account hold a live Pass from an issuer on the network? */
  async verifyPass(account: string): Promise<PassResult> {
    const credential = await this.findCredential(account, ['KYB_VERIFIED', 'KYB_BASIC']);
    return { verified: !!credential, account, tier: credential?.type ?? null, credential };
  }

  /** KYA: is this account an agent attested by a network issuer, acting for a business that holds a Pass? */
  async verifyAgent(agent: string): Promise<AgentResult> {
    const checks: Check[] = [];
    const add = (c: Omit<Check, 'effect'>) => checks.push({ ...c, effect: 'DENY' });

    const kya = await this.findCredential(agent, ['AGENT_AUTHORIZED']);
    add({ id: 'agent_credential', label: 'Agent attested', ok: !!kya, detail: kya ? `AGENT_AUTHORIZED from ${kya.issuer}` : 'No live AGENT_AUTHORIZED credential from a network issuer' });

    const { hash, uri } = await this.didHash(agent);
    add({ id: 'anchor', label: 'Mandate anchored', ok: !!hash, detail: hash ? `DID holds ${hash.slice(0, 12)}…` : 'No Mandate anchored on the agent account (DID)' });

    const signed = hash ? await this.loadMandate(hash, uri) : null;
    const principal = signed?.mandate.principal ?? null;
    if (hash) add({ id: 'document', label: 'Mandate found', ok: !!signed, detail: signed ? 'Document resolved' : 'Could not resolve the Mandate document' });

    if (signed && principal) {
      const pass = await this.verifyPass(principal);
      add({ id: 'principal_pass', label: 'Business holds a Pass', ok: pass.verified, detail: pass.verified ? `${pass.tier} from ${pass.credential!.issuer}` : 'The business has no live Pass' });
      const delegated = await this.hasDelegation(principal, agent, 'Payment');
      add({ id: 'delegation', label: 'Payments delegated', ok: delegated, detail: delegated ? 'DelegateSet: the business delegated Payment to the agent' : 'No delegation from the business to this agent' });
      if (kya) {
        const named = agentBinding(kya.uri).principal;
        const bound = named === principal;
        add({ id: 'bound', label: 'Agent bound to the business', ok: bound, detail: bound ? 'The agent credential names this business' : 'The agent credential does not name this business' });
        const sameIssuer = !!pass.credential && pass.credential.issuer === kya.issuer;
        add({ id: 'same_issuer', label: 'Attested by the business issuer', ok: sameIssuer, detail: sameIssuer ? 'The issuer that verified the business also attested the agent' : "The agent was attested by a different issuer than the business's Pass" });
      }
      const anchor = await this.didHash(principal);
      const current = anchor.hash;
      let live = current === hash;
      if (!live && current && this.opts.resolveMandateSet) {
        const set = await this.opts.resolveMandateSet(current, anchor.uri).catch(() => null);
        live = !!set && set.principal === principal && set.agents[agent] === hash;
      }
      add({ id: 'business_anchor', label: 'Current Mandate', ok: live, detail: live ? 'The business anchored this Mandate as its current one' : current ? 'The business anchored a different Mandate: this one is not current' : 'The business has not anchored a current Mandate' });
    }

    return { authorized: checks.every((c) => c.ok), agent, principal, issuer: kya?.issuer ?? null, mandateHash: hash, evm: agentBinding(kya?.uri ?? null).evm, checks };
  }

  /** Is this payment inside the agent's Mandate? ALLOW, NEEDS_APPROVAL or DENY, every check explained. */
  async checkMandate(agent: string, req: PaymentRequest, usageIn?: Usage): Promise<MandateResult> {
    const rate = (this.opts.rates ?? { USD: 1, RLUSD: 1 })[req.currency];
    const usd = rate === undefined ? NaN : req.amount * rate;
    const base = await this.verifyAgent(agent);
    const checks: Check[] = [...base.checks];
    const { hash, uri } = await this.didHash(agent);
    const signed = hash ? await this.loadMandate(hash, uri) : null;
    const m = signed?.mandate ?? null;
    const usage = usageIn ?? (m ? await this.spent(m.principal, agent) : { today: 0, month: 0 });

    if (signed && m) {
      const recomputed = sha256Hex(canonical(m));
      checks.push({ id: 'integrity', label: 'Integrity', ok: recomputed === hash, effect: 'DENY', detail: recomputed === hash ? 'Document matches the anchored hash' : 'The document was altered' });
      let sigOk = false;
      try { sigOk = verify(recomputed, signed.signature, signed.publicKey) && deriveAddress(signed.publicKey) === m.principal; } catch { sigOk = false; }
      checks.push({ id: 'signature', label: 'Signed by the business', ok: sigOk, effect: 'DENY', detail: sigOk ? `Valid signature of ${m.principal}` : 'Signature does not match the business account' });
      const live = new Date(m.validUntil).getTime() > Date.now();
      checks.push({ id: 'validity', label: 'In force', ok: live, effect: 'DENY', detail: live ? `Until ${m.validUntil.slice(0, 10)}` : `Expired on ${m.validUntil.slice(0, 10)}` });
      checks.push({ id: 'agent', label: 'Names this agent', ok: m.agent === agent, effect: 'DENY', detail: m.agent === agent ? 'The Mandate names this account' : 'The Mandate belongs to another account' });
      if (!m.enabled) checks.push({ id: 'enabled', label: 'Agent active', ok: false, effect: 'DENY', detail: 'The business paused the agent' });

      const pay = m.permissions.pay;
      checks.push({ id: 'permission', label: 'May pay', ok: pay === 'EXECUTE', effect: pay === 'PREPARE' ? 'APPROVAL' : 'DENY', detail: `Pay permission: ${pay}` });
      checks.push({ id: 'currency', label: 'Known currency', ok: Number.isFinite(usd), effect: 'DENY', detail: Number.isFinite(usd) ? `${req.amount} ${req.currency} = USD ${usd.toFixed(2)}` : `No USD rate for ${req.currency}` });
      if (Number.isFinite(usd)) {
        checks.push({ id: 'per_payment', label: 'Per-payment limit', ok: usd <= m.limits.perPayment, effect: 'APPROVAL', detail: `USD ${usd.toFixed(2)} of USD ${m.limits.perPayment}` });
        checks.push({ id: 'daily', label: 'Daily limit', ok: usage.today + usd <= m.limits.daily, effect: 'APPROVAL', detail: `USD ${(usage.today + usd).toFixed(2)} of USD ${m.limits.daily}` });
        checks.push({ id: 'monthly', label: 'Monthly limit', ok: usage.month + usd <= m.limits.monthly, effect: 'APPROVAL', detail: `USD ${(usage.month + usd).toFixed(2)} of USD ${m.limits.monthly}` });
        if (m.limits.quarterly !== undefined) {
          const q = (usage.quarter ?? usage.month) + usd;
          checks.push({ id: 'quarterly', label: 'Quarterly budget', ok: q <= m.limits.quarterly, effect: 'APPROVAL', detail: `USD ${q.toFixed(2)} of USD ${m.limits.quarterly}` });
        }
      }
      if (m.categories) {
        const allowed = !!req.category && m.categories.includes(req.category);
        checks.push({ id: 'category', label: 'Category allowed', ok: allowed, effect: 'DENY', detail: allowed ? `${req.category} is in this agent's Mandate` : `${req.category ?? 'No category'} is not one of ${m.categories.join(', ')}` });
      }
      const rule = m.rules.find((r) => (r.counterparty && r.counterparty === req.destination) || (r.category && r.category === req.category));
      if (rule) {
        const ok = rule.approval === 'AUTO' && !(rule.maxUsd !== undefined && usd > rule.maxUsd);
        checks.push({ id: 'rule', label: 'Business rule', ok, effect: 'APPROVAL', detail: ok ? 'The rule lets the agent pay alone' : 'The rule asks for approval' });
      }
    }

    const dest = await this.verifyPass(req.destination);
    checks.push({ id: 'counterparty', label: 'Counterparty holds a Pass', ok: dest.verified, effect: 'DENY', detail: dest.verified ? `${dest.tier} from ${dest.credential!.issuer}` : 'The counterparty has no Pass: Flow Check does not pay it' });

    const failed = checks.filter((c) => !c.ok);
    const decision = failed.some((c) => c.effect === 'DENY') ? 'DENY' : failed.length ? 'NEEDS_APPROVAL' : 'ALLOW';
    return { decision, agent, mandate: m, mandateHash: hash, request: req, usd: Number.isFinite(usd) ? Number(usd.toFixed(2)) : NaN, checks };
  }

  /** Runs the Flow Check and, if allowed, pays as a delegate of the business. */
  async payWithPass(p: PayParams): Promise<PayResult> {
    const { agent, tokenIssuer, usage, ...req } = p;
    const result = await this.checkMandate(agent.address, req, usage);
    if (result.decision === 'DENY') return { ...result, status: 'REFUSED' };

    const principal = result.mandate!.principal;
    const pass = await this.verifyPass(principal);
    const tx: Payment = {
      TransactionType: 'Payment',
      Account: principal,
      Delegate: agent.address,
      Destination: req.destination,
      Amount: tokenIssuer
        ? { currency: currencyCode(req.currency), issuer: tokenIssuer, value: String(req.amount) }
        : String(Math.round(req.amount * 1_000_000)),
      CredentialIDs: pass.credential ? [pass.credential.index] : undefined,
    } as Payment;

    if (result.decision === 'NEEDS_APPROVAL') return { ...result, status: 'PENDING_APPROVAL', pendingTx: tx };

    const res = await this.client.submitAndWait(tx, { wallet: agent, autofill: true });
    const engineResult = (res.result.meta as any)?.TransactionResult as string;
    return {
      ...result,
      status: engineResult === 'tesSUCCESS' ? 'PAID' : 'FAILED',
      hash: res.result.hash,
      engineResult,
      explorer: this.txUrl(res.result.hash),
    };
  }
}
