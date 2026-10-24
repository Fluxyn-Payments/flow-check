// Local server with the same routes as the Lambda. Reads the state written by setup-testnet.
// Usage: pnpm dev  (DEMO_TOKEN=... to enable the demo scenes)
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { handle, type State } from './app.js';

process.env.WEB_DIR ??= '../web/dist';
const dir = process.env.FLOWCHECK_DIR ?? '../../packages/flow-check/.flowcheck';
const state = JSON.parse(await readFile(join(dir, 'testnet.json'), 'utf8')) as State;
state.mandates = {};
for (const f of await readdir(join(dir, 'mandates'))) {
  state.mandates[f.replace('.json', '')] = JSON.parse(await readFile(join(dir, 'mandates', f), 'utf8'));
}

createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const out = await handle(
    { method: req.method ?? 'GET', path: url.pathname, body: raw ? JSON.parse(raw) : null, headers: req.headers as Record<string, string> },
    state,
    process.env.DEMO_TOKEN,
  ).catch((e) => ({ status: 500, body: JSON.stringify({ error: e.message }), headers: { 'content-type': 'application/json' } }));
  res.writeHead(out.status, out.headers).end((out as { base64?: boolean }).base64 ? Buffer.from(out.body, 'base64') : out.body);
}).listen(8787, () => console.log('Flow Check API on http://localhost:8787'));
