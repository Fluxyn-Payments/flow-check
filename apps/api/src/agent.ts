import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool } from '@aws-sdk/client-bedrock-runtime';
import { Wallet } from 'xrpl';
import type { FlowCheck } from '@fluxyn/flow-check';
import type { State } from './app.js';
import { contextPrompt, getKnowledge } from './knowledge.js';
import { payoutViaRipple, type FiatBeneficiary } from './ripple.js';

const MODEL = process.env.AGENT_MODEL ?? 'us.anthropic.claude-sonnet-5-5';
const MAX_TURNS = 12;

// This month's bills, per agent. Demo data; the payments are real on testnet.
export type AgentKey = 'payables' | 'marketing';
export const agentOf = (s: State, key: AgentKey) => (key === 'marketing' && s.agents?.marketing ? s.agents.marketing : { address: s.agent.address, seed: s.agent.seed, mandateHash: s.mandateHash });
export const bills = (s: State, key: AgentKey = 'payables') => key === 'marketing' ? [
  { id: 'MKT-201', vendor: 'Atelier Norte Studio', destination: s.suppliers.b.address, amount: 800, currency: 'RLUSD', category: 'design' },
  { id: 'MKT-202', vendor: 'Atelier Norte Studio · launch event', destination: s.suppliers.b.address, amount: 2400, currency: 'RLUSD', category: 'events' },
  { id: 'MKT-203', vendor: 'Stratus Cloud LLC', destination: s.suppliers.a.address, amount: 300, currency: 'RLUSD', category: 'cloud' },
] : [
  { id: 'INV-1042', vendor: 'Stratus Cloud LLC', destination: s.suppliers.a.address, amount: 1200, currency: 'RLUSD', category: 'cloud' },
  { id: 'INV-1043', vendor: 'Atelier Norte Studio', destination: s.suppliers.b.address, amount: 6000, currency: 'RLUSD', category: 'design' },
  { id: 'INV-1044', vendor: 'New vendor (unverified)', destination: s.vendor.address, amount: 300, currency: 'RLUSD', category: 'services' },
  ...(s.suppliers.mx ? [{ id: 'INV-1045', vendor: 'Estudio Bruma SA de CV (Mexico)', destination: s.suppliers.mx.address, amount: 2500, currency: 'USD', category: 'design', rail: 'ripple' as const }] : []),
];

// Suppliers paid in local currency through Ripple Payments Direct (their Pass is still on XRPL)
const FIAT: Record<string, FiatBeneficiary> = {
  'INV-1045': {
    name: 'Estudio Bruma SA de CV', country: 'MX', currency: 'MXN', rail: 'MX_SPEI', clabe: '002010077777777771', bankName: 'Banamex',
    email: 'pagos@estudiobruma.example', phone: '+525500000000',
    address: { streetAddress: ['Av. Paseo de la Reforma 222'], city: 'Ciudad de Mexico', stateOrProvince: 'CMX', postalCode: '06600', country: 'MX' },
  },
};

const SYSTEM = `You are the payables agent of a business. You pay its bills on the XRP Ledger, acting for the business through a delegation.
Rules:
- You can only move money with the pay_with_pass tool. It runs Flow Check: it pays, asks the CFO for approval, or refuses.
- Never try to work around a refusal or an approval request. Report it.
- Before paying, check who you are with verify_agent.
- Always pass each bill's category to pay_with_pass and check_mandate: your Mandate may only allow some categories.
- Some suppliers are paid in their local currency through Ripple Payments Direct. Use pay_with_pass for them too, with the bill's currency (USD); it routes the payout. If the result says simulated, say the payout was sent to Ripple's mock and do not comment on the returned amounts.
- Your final answer is shown under cards that already list every bill and its outcome. So reply in at most two short sentences and 40 words, plain text: no markdown, no lists, no links, do not repeat amounts or bill numbers already shown. Say what happened overall and the single most useful next step.
- If the CFO only asks a question (balance of rules, what you can do, whether a supplier has a Pass), answer it with the read-only tools and do not pay.`;

const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Tool => ({
  toolSpec: { name, description, inputSchema: { json: { type: 'object', properties, required } as any } },
});

export const TOOLS: Tool[] = [
  tool('list_bills', "List this month's bills to pay."),
  tool('verify_agent', 'Know Your Agent: check on the ledger that you are attested, delegated and bound by a Mandate.'),
  tool('verify_pass', 'Check whether an account holds a Fluxyn Pass from an issuer on the network.', { account: { type: 'string' } }, ['account']),
  tool('check_mandate', 'Check a payment against your Mandate without paying. Returns ALLOW, NEEDS_APPROVAL or DENY with every check.', {
    destination: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' }, category: { type: 'string' }, bill_id: { type: 'string' },
  }, ['destination', 'amount', 'currency']),
  tool('pay_with_pass', 'Pay through Flow Check. Pays if allowed, creates an approval request for the CFO if needed, refuses otherwise.', {
    destination: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' }, category: { type: 'string' }, bill_id: { type: 'string' },
  }, ['destination', 'amount', 'currency']),
];

export type Step = { tool: string; input: unknown; output: unknown };
export type AgentRun = { model: string; reply: string; steps: Step[] };

const brief = (r: any) => ({
  decision: r.decision, status: r.status, engineResult: r.engineResult, explorer: r.explorer,
  failed: (r.checks ?? []).filter((c: any) => !c.ok).map((c: any) => `${c.label}: ${c.detail}`),
});

// The agent's tools, shared by the web chat and the agent's own MCP server
export function agentExec(fc: FlowCheck, s: State, key: AgentKey) {
  const agent = Wallet.fromSeed(agentOf(s, key).seed);
  return async (name: string, input: any): Promise<unknown> => {
    switch (name) {
      case 'list_bills': return bills(s, key);
      case 'verify_agent': { const r = await fc.verifyAgent(agent.address); return { authorized: r.authorized, principal: r.principal, checks: r.checks.map((c) => `${c.ok ? 'ok' : 'FAIL'} ${c.label}`) }; }
      case 'verify_pass': return fc.verifyPass(String(input.account));
      case 'check_mandate': {
        const b = bills(s, key).find((x) => x.destination === input.destination && x.amount === Number(input.amount));
        return { bill: input.bill_id ?? b?.id, ...brief(await fc.checkMandate(agent.address, { destination: input.destination, amount: Number(input.amount), currency: input.currency, category: input.category })) };
      }
      case 'pay_with_pass': {
        const bill = bills(s, key).find((x) => x.destination === input.destination && x.amount === Number(input.amount)) as { id: string; rail?: string } | undefined;
        if (bill?.rail === 'ripple') {
          // Same Flow Check first; only then the cross-border payout
          const check = await fc.checkMandate(agent.address, { destination: input.destination, amount: Number(input.amount), currency: 'USD', category: input.category });
          if (check.decision !== 'ALLOW') return { bill: bill.id, rail: 'Ripple Payments Direct', ...brief({ ...check, status: check.decision === 'DENY' ? 'REFUSED' : 'PENDING_APPROVAL' }) };
          const payout = await payoutViaRipple(FIAT[bill.id], Number(input.amount), bill.id);
          return { bill: bill.id, decision: 'ALLOW', status: 'PAID', ...payout };
        }
        const r = await fc.payWithPass({ agent, destination: input.destination, amount: Number(input.amount), currency: input.currency, category: input.category, tokenIssuer: input.currency === 'XRP' ? undefined : s.rlusdIssuer.address });
        return { bill: input.bill_id, ...brief(r) };
      }
      default: return { error: `unknown tool ${name}` };
    }
  };
}

export async function runAgent(fc: FlowCheck, s: State, message: string, key: AgentKey = 'payables'): Promise<AgentRun> {
  const bedrock = new BedrockRuntimeClient({});
  const steps: Step[] = [];
  const system = SYSTEM + contextPrompt(await getKnowledge(key));

  const exec = agentExec(fc, s, key);

  if (process.env.ANTHROPIC_API_KEY) return runOnAnthropic(message, exec, steps, system);

  const messages: Message[] = [{ role: 'user', content: [{ text: message }] }];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await bedrock.send(new ConverseCommand({
      modelId: MODEL,
      system: [{ text: system }],
      messages,
      toolConfig: { tools: TOOLS },
      inferenceConfig: { maxTokens: 1500 },
    }));
    const out = res.output?.message;
    if (!out) break;
    messages.push(out);
    const uses = (out.content ?? []).filter((b) => b.toolUse);
    if (res.stopReason !== 'tool_use' || uses.length === 0) {
      return { model: MODEL, reply: (out.content ?? []).map((b) => b.text ?? '').join('').trim(), steps };
    }
    const results: ContentBlock[] = [];
    for (const b of uses) {
      const { toolUseId, name, input } = b.toolUse!;
      let output: unknown;
      try { output = await exec(name!, input); } catch (e) { output = { error: (e as Error).message }; }
      steps.push({ tool: name!, input, output });
      // Bedrock needs a JSON object here, not an array or a primitive
      const body = output && typeof output === 'object' && !Array.isArray(output) ? output : { result: output };
      results.push({ toolResult: { toolUseId, content: [{ json: body as any }] } });
    }
    messages.push({ role: 'user', content: results });
  }
  return { model: MODEL, reply: 'The agent stopped before finishing.', steps };
}

// Same loop on the Anthropic API, used when the account's Bedrock access is not available
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';

async function runOnAnthropic(message: string, exec: (name: string, input: any) => Promise<unknown>, steps: Step[], system: string): Promise<AgentRun> {
  const tools = TOOLS.map((t) => ({ name: t.toolSpec!.name, description: t.toolSpec!.description, input_schema: (t.toolSpec!.inputSchema as any).json }));
  const messages: any[] = [{ role: 'user', content: message }];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1500, system, tools, messages }),
    });
    const res: any = await r.json();
    if (!r.ok) throw new Error(res?.error?.message ?? `Anthropic API ${r.status}`);
    messages.push({ role: 'assistant', content: res.content });
    const uses = res.content.filter((b: any) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || uses.length === 0) {
      return { model: ANTHROPIC_MODEL, reply: res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim(), steps };
    }
    const results = [];
    for (const u of uses) {
      let output: unknown;
      try { output = await exec(u.name, u.input); } catch (e) { output = { error: (e as Error).message }; }
      steps.push({ tool: u.name, input: u.input, output });
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(output) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { model: ANTHROPIC_MODEL, reply: 'The agent stopped before finishing.', steps };
}
