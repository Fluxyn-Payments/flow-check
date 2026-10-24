import { Link } from 'react-router-dom';
import { Bot, ChevronRight, Code2, Globe, Plug, Puzzle } from 'lucide-react';
import { useApi, type AgentResult } from '../api';
import { Addr, Card, Loading, Pill } from '../components/ui';

type Network = { agent: string; business: string };
type MandateView = {
  hash: string | null;
  spent: { today: number; month: number } | null;
  mandate: null | {
    version: number; validUntil: string;
    permissions: { pay: string; collect: string; treasury: string };
    limits: { perPayment: number; daily: number; monthly: number };
    rules: { category?: string; counterparty?: string; approval: string; maxUsd?: number }[];
  };
};
type Ap4m = { enabled: boolean; channel?: { cap: string; status: string } | null; budget?: { cap: string } };

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="num text-muted">{usd(used)} of {usd(limit)}</span></div>
      <div className="mt-1.5 h-2 rounded-full bg-sunken"><div className="h-2 rounded-full bg-teal" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// The business view of its agents: who they are, the Mandate they work under, and the rails they can use
export function Agents() {
  const { data: net } = useApi<Network>('/api/network');
  const { data: kya } = useApi<AgentResult & { evm: string | null }>(net ? `/api/agent/${net.agent}` : null);
  const { data: md } = useApi<MandateView>(net ? `/api/mandate/${net.agent}` : null);
  const { data: ap4m } = useApi<Ap4m>('/api/ap4m');
  const m = md?.mandate;

  const rails = [
    { name: 'XRP Ledger · RLUSD', detail: 'Suppliers with a Pass, delegated payments', status: <Pill tone="ok">live</Pill> },
    { name: 'Mastercard Agent Pay for Machines', detail: ap4m?.channel ? `Channel cap ${Number(ap4m.channel.cap)} RLUSD · ${ap4m.channel.status}` : 'Funded channel on XRPL EVM', status: <Pill tone={ap4m?.enabled ? 'ok' : 'neutral'}>{ap4m?.enabled ? 'live' : 'not connected'}</Pill> },
    { name: 'Ripple Payments Direct', detail: 'Cross-border fiat payouts', status: <Pill tone="neutral">roadmap</Pill> },
  ];
  const channels = [
    { icon: Globe, name: 'Web app', status: 'live' },
    { icon: Code2, name: 'API', status: 'live' },
    { icon: Plug, name: 'MCP (Flow Check tools)', status: 'live' },
    { icon: Puzzle, name: 'Widget', status: 'roadmap' },
  ];

  return (
    <div className="space-y-6">
      <div className="rise">
        <h1 className="text-3xl font-bold sm:text-4xl">Agents</h1>
        <p className="mt-2 max-w-2xl text-muted">What the business sees: its agents, the Mandate each one works under, and the rails it may use. One rulebook, every rail.</p>
      </div>

      {!kya && <Loading />}
      {kya && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-tealink"><Bot className="h-5 w-5" /></div>
              <div>
                <div className="font-display text-lg font-bold">Payables agent</div>
                <div className="text-[13px] text-muted">XRPL <Addr value={kya.agent} /> · XRPL EVM <span className="font-mono text-[12.5px]">{kya.evm ? `${kya.evm.slice(0, 6)}…${kya.evm.slice(-4)}` : '—'}</span></div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={kya.authorized ? 'ok' : 'no'}>{kya.authorized ? 'KYA · AUTHORIZED' : 'NOT AUTHORIZED'}</Pill>
              <Link to={`/agents/${kya.agent}`} className="inline-flex items-center gap-1 text-sm font-semibold text-tealink hover:underline">Flow Check <ChevronRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Mandate" action={m && <span className="font-mono text-[11px] text-muted">v{m.version} · until {m.validUntil.slice(0, 10)}</span>}>
          {!md && <Loading />}
          {md && !m && <div className="text-sm text-muted">No Mandate published.</div>}
          {m && md?.spent && (
            <div className="space-y-4">
              <div className="text-sm"><span className="font-semibold">Per payment</span> <span className="text-muted">up to {usd(m.limits.perPayment)}; above that, the CFO approves.</span></div>
              <Meter label="Today" used={md.spent.today} limit={m.limits.daily} />
              <Meter label="This month" used={md.spent.month} limit={m.limits.monthly} />
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(m.permissions).map(([k, v]) => <Pill key={k} tone={v === 'EXECUTE' ? 'ok' : v === 'OFF' ? 'neutral' : 'teal'}>{k}: {v}</Pill>)}
                <Pill tone="teal">counterparties: Pass holders only</Pill>
              </div>
              <div className="text-xs text-muted">Signed by the business, hash anchored on the ledger · spending read from the ledger</div>
            </div>
          )}
        </Card>

        <Card title="Rails">
          <ul className="divide-y divide-line">
            {rails.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-3 py-3">
                <div><div className="font-semibold">{r.name}</div><div className="text-[13px] text-muted">{r.detail}</div></div>
                {r.status}
              </li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-muted">Flow Check decides whether the agent may pay; routing picks the rail.</div>
        </Card>
      </div>

      <Card title="Where the business connects">
        <div className="grid gap-3 sm:grid-cols-4">
          {channels.map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><c.icon className="h-4 w-4 text-tealink" />{c.name}</span>
              <Pill tone={c.status === 'live' ? 'ok' : c.status === 'building' ? 'warn' : 'neutral'}>{c.status}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
