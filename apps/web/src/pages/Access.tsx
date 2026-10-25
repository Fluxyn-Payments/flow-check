import { useState, type ReactNode } from 'react';
import { Code2 as Code2Icon, CreditCard as CreditCardIcon, FolderGit2 as FolderGit2Icon, KeyRound as KeyRoundIcon, Link2 as Link2Icon } from 'lucide-react';
import { Copy, ExternalLink } from 'lucide-react';
import { useApi } from '../api';
import { Card, Pill } from '../components/ui';
import { getSession, ROLE_LABEL, type Role } from '../session';

type Accounts = { accounts: { email: string; role: Role; name: string; org: string }[]; password: string };
type Network = { issuers: { vasp: string; psp: string }; business: string; agent: string; suppliers: { a: string; b: string }; rlusdIssuer: string };
type Ap4m = { contracts?: Record<string, string> };

const VIEWS: Record<Role, { path: string; what: string }> = {
  business: { path: '/workspace', what: 'Agent workspace, agents and budgets (CFO)' },
  member: { path: '/workspace', what: 'Marketing team: only its own agent' },
  issuer: { path: '/issuer', what: 'Clients and agents, attest and revoke' },
  network: { path: '/', what: 'Network, issuers, Mastercard rail, Access' },
  merchant: { path: '/merchant', what: 'Payments through Mastercard AP4M' },
};

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-tealink hover:bg-mint" aria-label="Copy">
      <Copy className="h-3.5 w-3.5" />{done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="text-sm font-semibold">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-sm">{children}</span>
    </li>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 break-all font-semibold text-tealink hover:underline">{children}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>;
}

const account = (a: string) => `https://testnet.xrpl.org/accounts/${a}`;

// Private hub for the network admin: every view, demo account and developer resource in one place
export function Access() {
  const session = getSession();
  const { data: acc } = useApi<Accounts>(session?.role === 'network' ? '/api/demo-accounts' : null);
  const { data: net } = useApi<Network>(session?.role === 'network' ? '/api/network' : null);
  const { data: ap4m } = useApi<Ap4m>(session?.role === 'network' ? '/api/ap4m' : null);

  if (session?.role !== 'network') return <Card><div className="text-sm text-muted">Only the network admin can see this page.</div></Card>;

  const origin = window.location.origin;
  const mcp = JSON.stringify({
    mcpServers: {
      'flow-check': {
        command: 'node',
        args: ['packages/mcp/dist/index.js'],
        env: { FLOWCHECK_ISSUERS: net ? `${net.issuers.vasp},${net.issuers.psp}` : 'rIssuer1...,rIssuer2...', FLOWCHECK_API: origin },
      },
    },
  }, null, 2);

  return (
    <div className="space-y-6">
      <div className="rise">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-tealink">Network admin</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Access</h1>
        <p className="mt-2 max-w-2xl text-muted">Every view, account and API. Internal.</p>
      </div>

      <Card title="Apps and demo accounts" icon={KeyRoundIcon} action={acc && <span className="flex items-center gap-2 text-xs text-muted">Shared password <span className="font-mono text-ink">{acc.password}</span><CopyButton value={acc.password} /></span>}>
        <ul className="divide-y divide-line">
          {(acc?.accounts ?? []).map((a) => (
            <li key={a.email} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-center sm:gap-4">
              <span className="flex items-center gap-2"><Pill tone="teal">{ROLE_LABEL[a.role]}</Pill></span>
              <span className="text-sm"><span className="font-mono">{a.email}</span> <CopyButton value={a.email} /><span className="block text-[13px] text-muted">{a.org} · {VIEWS[a.role].what}</span></span>
              <Ext href={`${origin}${VIEWS[a.role].path}`}>{VIEWS[a.role].path}</Ext>
            </li>
          ))}
        </ul>
        <div className="mt-2 text-xs text-muted">Sign-in page: <Ext href={`${origin}/signin`}>{origin}/signin</Ext></div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Developers" icon={Code2Icon}>
          <ul className="divide-y divide-line">
            <Row label="API docs (Swagger)"><Ext href="/api/docs">/api/docs</Ext></Row>
            <Row label="OpenAPI 3.1"><Ext href="/api/openapi.json">/api/openapi.json</Ext></Row>
            <Row label="Postman collection"><a href="/api/postman.json" download className="font-semibold text-tealink hover:underline">Download</a></Row>
            <Row label="Base URL"><span className="font-mono text-[12.5px]">{origin}</span><CopyButton value={origin} /></Row>
          </ul>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">MCP server (Claude Desktop, Claude Code, Cursor)</span><CopyButton value={mcp} /></div>
            <pre className="overflow-x-auto rounded-xl bg-sunken p-3 font-mono text-[12px] leading-relaxed">{mcp}</pre>
            <div className="mt-1 text-xs text-muted">Tools: verify_agent, verify_pass, check_mandate (pay_with_pass when an agent seed is configured).</div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Mastercard AP4M" icon={CreditCardIcon}>
            <ul className="divide-y divide-line">
              <Row label="Our x402 Merchant"><Ext href="https://d1p8wvj2ujopmx.cloudfront.net/resource">d1p8wvj2ujopmx.cloudfront.net/resource</Ext></Row>
              <Row label="Team portal"><Ext href="https://hackathon.ap4m.build/participant">hackathon.ap4m.build/participant</Ext></Row>
              {Object.entries(ap4m?.contracts ?? {}).map(([name, a]) => (
                <Row key={name} label={name}><Ext href={`https://explorer.testnet.xrplevm.org/address/${a}`}>{a.slice(0, 8)}…{a.slice(-6)}</Ext></Row>
              ))}
            </ul>
          </Card>

          <Card title="On the ledger (XRPL testnet)" icon={Link2Icon}>
            <ul className="divide-y divide-line">
              {net && [
                ['Issuer · Demo VASP', net.issuers.vasp], ['Issuer · Demo PSP', net.issuers.psp], ['Business', net.business],
                ['Agent', net.agent], ['Supplier A', net.suppliers.a], ['Supplier B', net.suppliers.b], ['RLUSD issuer', net.rlusdIssuer],
              ].map(([label, a]) => <Row key={label} label={label}><Ext href={account(a)}>{a.slice(0, 8)}…{a.slice(-4)}</Ext></Row>)}
            </ul>
          </Card>

          <Card title="Code and prior work" icon={FolderGit2Icon}>
            <ul className="divide-y divide-line">
              <Row label="Public repo"><Ext href="https://github.com/Fluxyn-Payments/flow-check">Fluxyn-Payments/flow-check</Ext></Row>
              <Row label="Fluxyn business app (prior work)"><Ext href="https://xrplcommons.fluxyn.com">xrplcommons.fluxyn.com</Ext></Row>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
