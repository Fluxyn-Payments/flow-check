#!/usr/bin/env node
// Flow Check MCP server (stdio). Gives any agent the checks it must pass before paying, and a payment
// tool that only moves money through Flow Check.
//
// Environment:
//   FLOWCHECK_ISSUERS     comma-separated issuer accounts that belong to the network (required)
//   FLOWCHECK_API         base URL that serves published Mandates at /api/mandates/hash/:hash (optional)
//   FLOWCHECK_AGENT_SEED  the agent's XRPL seed; without it pay_with_pass is not offered
//   FLOWCHECK_NETWORK     testnet (default) | devnet | mainnet
//   FLOWCHECK_RLUSD_ISSUER issuer of the RLUSD token paid by pay_with_pass
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Wallet } from 'xrpl';
import { FlowCheck, type SignedMandate } from '@fluxyn/flow-check';

const issuers = (process.env.FLOWCHECK_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (issuers.length === 0) {
  console.error('Set FLOWCHECK_ISSUERS to the issuer accounts of the network.');
  process.exit(1);
}
const api = process.env.FLOWCHECK_API?.replace(/\/$/, '');
const fc = new FlowCheck({
  network: (process.env.FLOWCHECK_NETWORK as 'testnet' | 'devnet' | 'mainnet') ?? 'testnet',
  issuers,
  resolveMandate: api
    ? async (hash) => {
        const r = await fetch(`${api}/api/mandates/hash/${hash}`).catch(() => null);
        return r?.ok ? ((await r.json()) as SignedMandate) : null;
      }
    : undefined,
});
const agent = process.env.FLOWCHECK_AGENT_SEED ? Wallet.fromSeed(process.env.FLOWCHECK_AGENT_SEED) : null;

const reply = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const failed = (checks: { ok: boolean; label: string; detail: string }[]) => checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`);

const server = new McpServer({ name: 'flow-check', version: '0.1.0' });

server.registerTool('verify_agent', {
  description: 'Know Your Agent: check on the XRP Ledger that an agent is attested by its business\'s issuer, delegated, and bound by a current Mandate.',
  inputSchema: { agent: z.string().describe('Agent XRPL account (r...). Defaults to this server\'s agent.').optional() },
}, async ({ agent: a }) => {
  await fc.connect();
  const r = await fc.verifyAgent(a ?? agent?.address ?? '');
  return reply({ authorized: r.authorized, agent: r.agent, principal: r.principal, issuer: r.issuer, evm: r.evm, failed: failed(r.checks) });
});

server.registerTool('verify_pass', {
  description: 'Check whether an account holds a Fluxyn Pass (KYB credential) from an issuer on the network.',
  inputSchema: { account: z.string().describe('XRPL account (r...)') },
}, async ({ account }) => {
  await fc.connect();
  const r = await fc.verifyPass(account);
  return reply({ verified: r.verified, tier: r.tier, issuer: r.credential?.issuer ?? null });
});

server.registerTool('check_mandate', {
  description: 'Check a payment against the agent\'s Mandate without paying. Returns ALLOW, NEEDS_APPROVAL or DENY with every failed check.',
  inputSchema: {
    destination: z.string(), amount: z.number().positive(), currency: z.string().default('RLUSD'),
    category: z.string().optional(), agent: z.string().optional(),
  },
}, async ({ destination, amount, currency, category, agent: a }) => {
  await fc.connect();
  const r = await fc.checkMandate(a ?? agent?.address ?? '', { destination, amount, currency, category });
  return reply({ decision: r.decision, usd: r.usd, failed: failed(r.checks) });
});

if (agent) {
  server.registerTool('pay_with_pass', {
    description: 'Pay through Flow Check as a delegate of the business. Pays if allowed, returns a pending payment for human approval if needed, refuses otherwise. The only way this agent can move money.',
    inputSchema: { destination: z.string(), amount: z.number().positive(), currency: z.string().default('RLUSD'), category: z.string().optional() },
  }, async ({ destination, amount, currency, category }) => {
    await fc.connect();
    const r = await fc.payWithPass({ agent, destination, amount, currency, category, tokenIssuer: currency === 'XRP' ? undefined : process.env.FLOWCHECK_RLUSD_ISSUER });
    return reply({ status: r.status, decision: r.decision, engineResult: r.engineResult, explorer: r.explorer, failed: failed(r.checks) });
  });
}

await server.connect(new StdioServerTransport());
