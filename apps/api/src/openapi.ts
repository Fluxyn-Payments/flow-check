// OpenAPI 3.1 description of the Flow Check API, plus the Swagger UI page and a Postman collection built from it.
// Example values are public testnet data; no seeds, tokens or keys.

const AGENT = 'rUSnxoRnZsfedr3Qbhm3r2KXCcafoXN1R';
const BUSINESS = 'rEtkU7RQGTYW8n5Zhv2FgwwY4LAGyghfHQ';
const ISSUER = 'rMF3FnTvyqMC2xM6v6Wr15Ye2K42kYhmm1';
const SUPPLIER = 'r9jREsR1KGKFh4toNntZJAEVQkBv2tBdmM';
const TX = 'https://testnet.xrpl.org/transactions/18778F589AB4A95E90E9328111B59F2AF2991001DDA1B690E091E9C6CDF9990C';

const check = { id: 'agent_credential', label: 'Agent attested', ok: true, effect: 'DENY', detail: `AGENT_AUTHORIZED from ${ISSUER}` };
const json = (example: unknown, description = 'OK') => ({ description, content: { 'application/json': { example } } });
const addr = (name: string, description: string, example: string) => ({ name, in: 'path', required: true, description, schema: { type: 'string' }, example });
const body = (example: unknown) => ({ required: true, content: { 'application/json': { example } } });
const auth = (roles: string) => ({ security: [{ bearer: [] }], description: `Requires a session from /api/login with role: ${roles}.` });
const unauthorized = json({ error: 'sign in as the business' }, 'Missing or wrong role');

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Fluxyn Flow Check API',
    version: '0.1.0',
    description: 'KYA anchored in KYB: verify an AI agent, its business and its Mandate on the XRP Ledger before it pays. Testnet demo built at the XRPL Hackathon NYC 2026.',
  },
  servers: [
    { url: 'https://f65haq6h5jdpzx42ixfoxqrvvu0szjsk.lambda-url.us-east-1.on.aws', description: 'Demo (AWS)' },
    { url: 'https://flowcheck.fluxyn.com', description: 'Demo (custom domain, when live)' },
  ],
  tags: [
    { name: 'Flow Check', description: 'Know Your Agent, Pass and Mandate checks' },
    { name: 'Network', description: 'Issuers, businesses and agents read from the ledger' },
    { name: 'Agent', description: 'The agent of the signed-in user and the demo scenes' },
    { name: 'Business', description: 'CFO: agents, budgets and what each agent knows' },
    { name: 'Issuer', description: 'Attest and revoke agents' },
    { name: 'Mastercard AP4M', description: 'Funded channel, vouchers and settlement on XRPL EVM' },
    { name: 'Session', description: 'Demo sign-in' },
  ],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Session token returned by POST /api/login' } },
  },
  paths: {
    '/api/login': {
      post: {
        tags: ['Session'], summary: 'Sign in with a demo account',
        requestBody: body({ email: 'cfo@demo.fluxyn.com', password: '<demo password>' }),
        responses: { 200: json({ token: '<session token>', email: 'cfo@demo.fluxyn.com', role: 'business', name: 'CFO', org: 'Demo business' }), 401: json({ error: 'wrong email or password' }, 'Wrong credentials') },
      },
    },
    '/api/demo-accounts': {
      get: { tags: ['Session'], summary: 'Demo accounts per role (pre-filled on the sign-in page)', responses: { 200: json({ accounts: [{ email: 'cfo@demo.fluxyn.com', role: 'business', name: 'CFO', org: 'Demo business' }], password: '<demo password>' }) } },
    },
    '/api/network': {
      get: { tags: ['Network'], summary: 'Demo network accounts (addresses only)', responses: { 200: json({ network: 'testnet', issuers: { vasp: ISSUER, psp: 'rHjuTTFgaMMKEewCu959EviKa9NJT2q2vJ' }, business: BUSINESS, agent: AGENT, suppliers: { a: SUPPLIER, b: 'rsdQGiVZtMsBz8S9P8KvmKmxZSwjsWdBDJ' }, mandateHash: '309CDBE6E2BB…' }) } },
    },
    '/api/directory': {
      get: { tags: ['Network'], summary: 'The whole network, discovered on the ledger', responses: { 200: json({ counts: { issuers: 5, businesses: 7, agents: 5, attested: 1 }, issuers: [{ address: ISSUER, name: 'Demo VASP · NYC', type: 'VASP', country: 'US', source: 'nyc', issued: 3 }], businesses: [{ address: BUSINESS, issuer: ISSUER, tier: 'KYB_VERIFIED', agents: [AGENT] }], agents: [{ address: AGENT, principal: BUSINESS, issuer: ISSUER, attested: true, delegated: true, mandate: true, status: 'ATTESTED' }], profiles: {} }) } },
    },
    '/api/profiles': {
      get: { tags: ['Network'], summary: 'Public profiles (names, agent tags, descriptions)', responses: { 200: json({ [AGENT]: { name: 'Lumen Robotics · payables agent', kind: 'agent', tag: 'Payables', description: "Pays the month's supplier invoices inside its Mandate", source: 'nyc' } }) } },
    },
    '/api/agent/{address}': {
      get: { tags: ['Flow Check'], summary: 'Know Your Agent: is this agent attested, delegated and bound by a current Mandate?', parameters: [addr('address', 'Agent XRPL account', AGENT)], responses: { 200: json({ authorized: true, agent: AGENT, principal: BUSINESS, issuer: ISSUER, mandateHash: '309CDBE6E2BB…', evm: '0xfEE5997C45707E6A65962E80aDBcFA2CcA3dEB0b', checks: [check] }) } },
    },
    '/api/pass/{address}': {
      get: { tags: ['Flow Check'], summary: 'Does this account hold a Fluxyn Pass from a network issuer?', parameters: [addr('address', 'XRPL account', SUPPLIER)], responses: { 200: json({ verified: true, account: SUPPLIER, tier: 'KYB_VERIFIED', credential: { issuer: ISSUER, type: 'KYB_VERIFIED', accepted: true, expired: false } }) } },
    },
    '/api/check': {
      post: {
        tags: ['Flow Check'], summary: 'Check a payment against the agent Mandate (no payment)',
        requestBody: body({ agent: AGENT, destination: SUPPLIER, amount: 6000, currency: 'RLUSD' }),
        responses: { 200: json({ decision: 'NEEDS_APPROVAL', agent: AGENT, usd: 6000, checks: [{ id: 'per_payment', label: 'Per-payment limit', ok: false, effect: 'APPROVAL', detail: 'USD 6000.00 of USD 5000' }] }) },
      },
    },
    '/api/mandate/{agent}': {
      get: { tags: ['Flow Check'], summary: "The agent's Mandate and what it already spent (read from the ledger)", parameters: [addr('agent', 'Agent XRPL account', AGENT)], responses: { 200: json({ hash: '309CDBE6E2BB…', spent: { today: 1200, month: 3600 }, mandate: { schema: 'passport.mandate/v1', agent: AGENT, principal: BUSINESS, limits: { currency: 'USD', perPayment: 5000, daily: 250000, monthly: 1000000 }, permissions: { pay: 'EXECUTE', collect: 'VIEW', treasury: 'OFF' } } }) } },
    },
    '/api/mandates/hash/{hash}': {
      get: { tags: ['Flow Check'], summary: 'A published Mandate by its anchored hash', parameters: [addr('hash', 'SHA-256 of the canonical Mandate', '309CDBE6…')], responses: { 200: json({ mandate: { schema: 'passport.mandate/v1' }, signature: '<signature>', publicKey: '<business public key>' }), 404: json({ error: 'unknown mandate' }, 'Not found') } },
    },
    '/api/events': {
      get: { tags: ['Network'], summary: 'Recent ledger transactions of the demo accounts', responses: { 200: json([{ hash: '18778F58…', type: 'Payment', from: 'business', via: 'agent', to: 'supplier A', amount: '1200 RLUSD', result: 'tesSUCCESS', explorer: TX }]) } },
    },
    '/api/activity/{address}': {
      get: { tags: ['Network'], summary: 'Recent ledger transactions of one account', parameters: [addr('address', 'XRPL account', BUSINESS)], responses: { 200: json([{ hash: '18778F58…', type: 'Payment', amount: '1200 RLUSD', result: 'tesSUCCESS', explorer: TX }]) } },
    },
    '/api/bills': {
      get: { tags: ['Agent'], summary: "This month's bills of the signed-in user's agent (the CFO's payables agent, or the team member's agent)", responses: { 200: json([{ id: 'INV-1042', vendor: 'Stratus Cloud LLC', destination: SUPPLIER, amount: 1200, currency: 'RLUSD', category: 'cloud' }]) } },
    },
    '/api/me': {
      get: { tags: ['Session'], summary: 'Who is signed in and which agent they operate', ...auth('business or member'), responses: { 200: json({ role: 'member', agent: 'rHyRoorD6GdqnPfCfkea7jkgSHnatLi2pd', agentKey: 'marketing', business: BUSINESS, canApprove: false }) } },
    },
    '/api/business/agents': {
      get: { tags: ['Business'], summary: "All the business's agents with their Mandate, budget and spending (CFO view)", responses: { 200: json([{ key: 'marketing', address: 'rHyRoorD6GdqnPfCfkea7jkgSHnatLi2pd', authorized: true, evm: null, mandate: { version: 1, validUntil: '2027-01-22T00:00:00.000Z', limits: { perPayment: 2000, daily: 5000, monthly: 10000, quarterly: 25000 }, categories: ['ads', 'design', 'events'] }, spent: { today: 800, month: 800, quarter: 800 } }]) } },
    },
    '/api/agents/{agentKey}/knowledge': {
      get: { tags: ['Business'], summary: 'What an agent knows: instructions, known suppliers, reference documents', ...auth('business, or the member who operates that agent'),
        parameters: [{ name: 'agentKey', in: 'path', required: true, schema: { type: 'string', enum: ['payables', 'marketing'] } }],
        responses: { 200: json({ instructions: 'Only pay marketing work: design, ads and events.', suppliers: [{ name: 'Atelier Norte Studio', category: 'design' }], documents: [{ title: 'payment-policy.md', text: '…' }], updatedAt: '2026-10-25T03:10:00.000Z' }), 401: unauthorized } },
      put: { tags: ['Business'], summary: 'Train an agent (CFO only). Context shapes what the agent proposes; it never overrides the Mandate', ...auth('business'),
        parameters: [{ name: 'agentKey', in: 'path', required: true, schema: { type: 'string', enum: ['payables', 'marketing'] } }],
        requestBody: body({ instructions: 'Pay the cloud bill on the 5th. Never split invoices.', suppliers: [{ name: 'Stratus Cloud LLC', account: SUPPLIER, category: 'cloud', notes: 'Due on the 5th' }], documents: [{ title: 'policy.md', text: 'Payment policy…' }] }),
        responses: { 200: json({ instructions: 'Pay the cloud bill on the 5th. Never split invoices.', suppliers: [], documents: [], updatedAt: '2026-10-25T03:10:00.000Z' }), 401: unauthorized } },
    },
    '/api/agent/run': {
      post: {
        tags: ['Agent'], summary: "Ask the signed-in user's agent (Claude on Amazon Bedrock); it only pays through Flow Check", ...auth('business or member'),
        requestBody: body({ message: "Pay this month's bills." }),
        responses: { 200: json({ model: 'us.anthropic.claude-sonnet-5-5', reply: 'INV-1042 paid; INV-1043 needs approval; INV-1044 refused.', steps: [{ tool: 'pay_with_pass', input: { destination: SUPPLIER, amount: 1200, currency: 'RLUSD' }, output: { decision: 'ALLOW', status: 'PAID', engineResult: 'tesSUCCESS', explorer: TX } }] }), 401: unauthorized, 429: json({ error: 'the demo agent is busy, try again in a few minutes' }, 'Rate limited') },
      },
    },
    '/api/demo/{scene}': {
      post: {
        tags: ['Agent'], summary: 'Run a demo scene on testnet', ...auth('business'),
        parameters: [{ name: 'scene', in: 'path', required: true, schema: { type: 'string', enum: ['1', '2', '2-approve', '3a', '3b'] }, description: '1 pay a supplier with a Pass · 2 over the Mandate · 2-approve simulated approval · 3a vendor without a Pass · 3b agent without KYA pays directly' }],
        responses: { 200: json({ decision: 'ALLOW', status: 'PAID', engineResult: 'tesSUCCESS', explorer: TX }), 401: unauthorized },
      },
    },
    '/api/issuer': {
      get: { tags: ['Issuer'], summary: 'Businesses verified and agents attested by the demo VASP', responses: { 200: json({ issuer: { address: ISSUER, name: 'Demo VASP · NYC', type: 'VASP' }, demoAgent: AGENT, demoBusiness: BUSINESS, issued: [{ subject: AGENT, type: 'AGENT_AUTHORIZED', accepted: true, expires: '2027-01-22T00:00:00.000Z', binding: { principal: BUSINESS, evm: '0xfEE5997C45707E6A65962E80aDBcFA2CcA3dEB0b' } }] }) } },
    },
    '/api/issuer/revoke': {
      post: { tags: ['Issuer'], summary: "Revoke the agent's attestation (CredentialDelete)", ...auth('issuer'), requestBody: body({ agent: AGENT }), responses: { 200: json({ engineResult: 'tesSUCCESS', hash: '5724E256…', explorer: TX }), 401: json({ error: 'sign in as the issuer' }, 'Missing or wrong role') } },
    },
    '/api/issuer/attest': {
      post: { tags: ['Issuer'], summary: 'Attest the demo agent again (CredentialCreate + CredentialAccept)', ...auth('issuer'), responses: { 200: json({ engineResult: 'tesSUCCESS', hash: 'EAFC8692…', explorer: TX }), 401: json({ error: 'sign in as the issuer' }, 'Missing or wrong role') } },
    },
    '/api/ap4m': {
      get: { tags: ['Mastercard AP4M'], summary: "The team's AP4M state: budget, channel and on-chain proof", responses: { 200: json({ enabled: true, network: 'XRPL EVM Testnet', budget: { cap: '20.000000', funded: '20.000000', status: 'active' }, channel: { id: '0x1e5d8296…', cap: '3.000000', status: 'open' }, proof: { voucherRedeemed: 'https://explorer.testnet.xrplevm.org/tx/0xe2074ab8…', claimPaid: null, settlementRecorded: null, receipt: false } }) } },
    },
    '/api/ap4m/over-cap': {
      post: { tags: ['Mastercard AP4M'], summary: 'Dry run: a voucher 1 RLUSD above the channel cap, checked by the PaymentLedger (nothing is sent)', responses: { 200: json({ enabled: true, cap: '3.0', redeemed: '3.0', attempted: '4.0', refused: true, reason: 'execution reverted', note: 'Dry run against the PaymentLedger (eth_call): nothing was sent.' }) } },
    },
  },
} as const;

// Swagger UI from a pinned CDN version, light theme
export const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fluxyn Flow Check API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
<style>body{margin:0;background:#f3f8f6}.topbar{display:none}.swagger-ui .info .title{color:#0b1a1f}.swagger-ui .btn.authorize{border-color:#14c9c0;color:#06756f}</style>
</head>
<body>
<div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#ui', persistAuthorization: true, tryItOutEnabled: true });</script>
</body>
</html>`;

// Postman v2.1 collection generated from the spec, with baseUrl and token variables
export function postmanCollection(baseUrl: string) {
  const byTag = new Map<string, unknown[]>();
  for (const [path, ops] of Object.entries(openapi.paths)) {
    for (const [method, op] of Object.entries(ops as Record<string, any>)) {
      const raw = `{{baseUrl}}${path.replace(/\{(\w+)\}/g, ':$1')}`;
      const pathVars = (op.parameters ?? []).filter((p: any) => p.in === 'path').map((p: any) => ({ key: p.name, value: String(p.example ?? p.schema?.enum?.[0] ?? '') }));
      const example = op.requestBody?.content?.['application/json']?.example;
      const isLogin = path === '/api/login';
      const item = {
        name: op.summary,
        request: {
          method: method.toUpperCase(),
          header: [
            ...(example ? [{ key: 'Content-Type', value: 'application/json' }] : []),
            ...(op.security ? [{ key: 'Authorization', value: 'Bearer {{token}}' }] : []),
          ],
          url: { raw, host: ['{{baseUrl}}'], path: path.replace(/\{(\w+)\}/g, ':$1').split('/').filter(Boolean), variable: pathVars },
          ...(example ? { body: { mode: 'raw', raw: JSON.stringify(example, null, 2), options: { raw: { language: 'json' } } } } : {}),
          description: op.description ?? '',
        },
        ...(isLogin ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: ['const r = pm.response.json();', 'if (r.token) pm.collectionVariables.set("token", r.token);'] } }] } : {}),
      };
      const tag = op.tags?.[0] ?? 'Other';
      byTag.set(tag, [...(byTag.get(tag) ?? []), item]);
    }
  }
  return {
    info: { name: 'Fluxyn Flow Check API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: openapi.info.description },
    variable: [{ key: 'baseUrl', value: baseUrl }, { key: 'token', value: '' }],
    item: [...byTag.entries()].map(([name, item]) => ({ name, item })),
  };
}
