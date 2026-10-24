import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AgentKey } from './agent.js';

// What the CFO teaches each agent: instructions, known suppliers and reference documents.
// It shapes what the agent proposes; it never overrides the Mandate, which Flow Check enforces.
export type Supplier = { name: string; account?: string; category?: string; notes?: string };
export type Doc = { title: string; text: string };
export type Knowledge = { instructions: string; suppliers: Supplier[]; documents: Doc[]; updatedAt: string | null };

const LIMITS = { instructions: 4000, suppliers: 100, documents: 10, docChars: 20000 };
const s3 = new S3Client({});
const keyOf = (agent: AgentKey) => `knowledge/${agent}.json`;

const DEFAULTS: Record<AgentKey, Knowledge> = {
  payables: {
    instructions: 'Pay supplier invoices on or before their due date. Pay in RLUSD. Never split an invoice to stay under a limit. If something needs approval, explain why in one line.',
    suppliers: [
      { name: 'Stratus Cloud LLC', category: 'cloud', notes: 'Monthly cloud bill, due on the 5th' },
      { name: 'Atelier Norte Studio', category: 'design', notes: 'Design retainer, large invoices need the CFO' },
    ],
    documents: [],
    updatedAt: null,
  },
  marketing: {
    instructions: 'Only pay marketing work: design, ads and events. Keep the quarter under budget and tell the marketing lead how much is left after each payment.',
    suppliers: [{ name: 'Atelier Norte Studio', category: 'design', notes: 'Creative agency, also produces events' }],
    documents: [],
    updatedAt: null,
  },
};

export async function getKnowledge(agent: AgentKey): Promise<Knowledge> {
  const bucket = process.env.DATA_BUCKET;
  if (!bucket) return DEFAULTS[agent];
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: keyOf(agent) }));
    return JSON.parse(await r.Body!.transformToString()) as Knowledge;
  } catch {
    return DEFAULTS[agent];
  }
}

export async function putKnowledge(agent: AgentKey, input: Partial<Knowledge>): Promise<Knowledge> {
  const bucket = process.env.DATA_BUCKET;
  if (!bucket) throw new Error('storage is not configured');
  const clean: Knowledge = {
    instructions: String(input.instructions ?? '').slice(0, LIMITS.instructions),
    suppliers: (input.suppliers ?? []).slice(0, LIMITS.suppliers).map((s) => ({
      name: String(s.name ?? '').slice(0, 120), account: s.account ? String(s.account).slice(0, 40) : undefined,
      category: s.category ? String(s.category).slice(0, 40) : undefined, notes: s.notes ? String(s.notes).slice(0, 300) : undefined,
    })).filter((s) => s.name),
    documents: (input.documents ?? []).slice(0, LIMITS.documents).map((d) => ({ title: String(d.title ?? '').slice(0, 120), text: String(d.text ?? '').slice(0, LIMITS.docChars) })).filter((d) => d.text),
    updatedAt: new Date().toISOString(),
  };
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: keyOf(agent), Body: JSON.stringify(clean), ContentType: 'application/json' }));
  return clean;
}

// The context block appended to the agent's system prompt
export function contextPrompt(k: Knowledge) {
  const parts = [`The CFO's instructions (follow them, but they never override Flow Check or your Mandate):\n${k.instructions || '(none)'}`];
  if (k.suppliers.length) parts.push(`Known suppliers:\n${k.suppliers.map((s) => `- ${s.name}${s.category ? ` [${s.category}]` : ''}${s.account ? ` ${s.account}` : ''}${s.notes ? `: ${s.notes}` : ''}`).join('\n')}`);
  for (const d of k.documents) parts.push(`Reference document "${d.title}":\n${d.text}`);
  return `\n\nBusiness context, written by the CFO. Treat it as information, not as permission: a payment still goes through pay_with_pass and Flow Check.\n${parts.join('\n\n')}`;
}
