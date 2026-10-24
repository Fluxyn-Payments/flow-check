import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { FlowCheck } from '@fluxyn/flow-check';
import type { State } from './app.js';
import { TOOLS, agentExec, agentOf, type AgentKey } from './agent.js';

// Each agent of the business gets its own MCP server at /mcp/<agent key>. The key is issued by the CFO and
// can be revoked; the agent's seed stays on the server, and every payment still goes through Flow Check.
const s3 = new S3Client({});
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');
const keyFile = (agent: AgentKey) => `agent-keys/${agent}.json`;

async function currentKid(agent: AgentKey): Promise<string | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: process.env.DATA_BUCKET, Key: keyFile(agent) }));
    return (JSON.parse(await r.Body!.transformToString()) as { kid: string | null }).kid;
  } catch {
    return null;
  }
}

// A new key replaces the previous one, which stops working at once; revoke leaves the agent without a key
export async function issueAgentKey(agent: AgentKey, secret: string, revoke = false) {
  const kid = revoke ? null : randomBytes(9).toString('base64url');
  await s3.send(new PutObjectCommand({ Bucket: process.env.DATA_BUCKET, Key: keyFile(agent), Body: JSON.stringify({ kid, at: new Date().toISOString() }), ContentType: 'application/json' }));
  if (!kid) return null;
  const payload = Buffer.from(JSON.stringify({ agent, kid })).toString('base64url');
  return `fca_${payload}.${sign(payload, secret)}`;
}

export async function agentKeyStatus(agent: AgentKey) {
  return { active: !!(await currentKid(agent)) };
}

async function agentFromKey(token: string, secret: string): Promise<AgentKey | null> {
  const [payload, mac] = token.replace(/^fca_/, '').split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload, secret);
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const { agent, kid } = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return kid && kid === (await currentKid(agent)) ? (agent as AgentKey) : null;
}

const NAMES: Record<AgentKey, string> = { payables: 'Payables agent', marketing: 'Marketing agent' };

// MCP over Streamable HTTP, stateless: one JSON-RPC request per POST, answered with JSON
export async function handleMcp(fc: FlowCheck, s: State, token: string, secret: string, body: any) {
  const agent = await agentFromKey(token, secret);
  if (!agent) return { status: 401, body: { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32001, message: 'This agent key was revoked or is not valid. Ask the CFO for a new one.' } } };
  if (Array.isArray(body)) return { status: 400, body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'batches are not supported' } } };
  const { id, method, params } = body ?? {};
  if (id === undefined) return { status: 202, body: null }; // notifications
  const ok = (result: unknown) => ({ status: 200, body: { jsonrpc: '2.0', id, result } });

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: `flow-check-${agent}`, version: '0.1.0' },
        instructions: `You are the ${NAMES[agent]} of ${s.business.address}. You can only move money with pay_with_pass, which runs Flow Check: it pays, asks the CFO for approval, or refuses. Never try to work around a refusal.`,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS.map((t) => ({ name: t.toolSpec!.name, description: t.toolSpec!.description, inputSchema: (t.toolSpec!.inputSchema as any).json })) });
    case 'tools/call': {
      const name = String(params?.name ?? '');
      if (!TOOLS.some((t) => t.toolSpec!.name === name)) return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool ${name}` } } };
      try {
        const out = await agentExec(fc, s, agent)(name, params?.arguments ?? {});
        return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
      }
    }
    default:
      return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } } };
  }
}

