import { Link } from 'react-router-dom';
import { Bot, ChevronRight, Code2, Globe, Megaphone, Plug, Puzzle, UserRound } from 'lucide-react';
import { useApi } from '../api';
import { Addr, Card, Loading, Pill } from '../components/ui';

type Limits = { perPayment: number; daily: number; monthly: number; quarterly?: number };
type AgentRow = {
  key: 'payables' | 'marketing'; address: string; authorized: boolean; evm: string | null;
  mandate: null | { version: number; validUntil: string; limits: Limits; categories?: string[]; permissions: { pay: string; collect: string; treasury: string } };
  spent: { today: number; month: number; quarter?: number } | null;
};
type Ap4m = { enabled: boolean; channel?: { cap: string; status: string } | null };

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const META = {
  payables: { name: 'Payables agent', icon: Bot, user: 'CFO · cfo@demo.fluxyn.com', blurb: "Pays the month's supplier invoices" },
  marketing: { name: 'Marketing agent', icon: Megaphone, user: 'Marketing lead · marketing@demo.fluxyn.com', blurb: 'Design, ads and events, within a quarterly budget' },
};

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="num text-muted">{usd(used)} of {usd(limit)}</span></div>
      <div className="mt-1.5 h-2 rounded-full bg-sunken"><div className="h-2 rounded-full bg-teal" style={{ width: `${Math.max(1, Math.min(100, (used / limit) * 100))}%` }} /></div>
    </div>
  );
}

// The CFO's view: every agent of the business, the Mandate and budget each one works under, and who operates it
export function Agents() {
  const { data: agents } = useApi<AgentRow[]>('/api/business/agents');
  const { data: ap4m } = useApi<Ap4m>('/api/ap4m');

  return (
    <div className="space-y-6">
      <div className="rise">
        <h1 className="text-3xl font-bold sm:text-4xl">Agents and budgets</h1>
        <p className="mt-2 max-w-2xl text-muted">The CFO creates an agent per team, gives it a Mandate (limits, quarterly budget, allowed categories) and a team member who operates it. Team members only see their own agent; settings stay with the CFO.</p>
      </div>

      {!agents && <Loading />}
      <div className="grid gap-6 lg:grid-cols-2">
        {agents?.map((a) => {
          const meta = META[a.key];
          const m = a.mandate;
          return (
            <Card key={a.address}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-tealink"><meta.icon className="h-5 w-5" /></div>
                  <div>
                    <div className="font-display text-lg font-bold">{meta.name}</div>
                    <div className="text-[13px] text-muted">{meta.blurb}</div>
                  </div>
                </div>
                <Pill tone={a.authorized ? 'ok' : 'no'}>{a.authorized ? 'KYA · AUTHORIZED' : 'NOT AUTHORIZED'}</Pill>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                <span>XRPL <Addr value={a.address} /></span>
                <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{meta.user}</span>
              </div>
              {m && a.spent ? (
                <div className="mt-5 space-y-4">
                  <div className="text-sm"><span className="font-semibold">Per payment</span> <span className="text-muted">up to {usd(m.limits.perPayment)}; above that, the CFO approves.</span></div>
                  <Meter label="Today" used={a.spent.today} limit={m.limits.daily} />
                  <Meter label="This month" used={a.spent.month} limit={m.limits.monthly} />
                  {m.limits.quarterly && <Meter label="Quarter budget" used={a.spent.quarter ?? 0} limit={m.limits.quarterly} />}
                  <div className="flex flex-wrap gap-2">
                    {m.categories ? m.categories.map((c) => <Pill key={c} tone="teal">{c}</Pill>) : <Pill tone="neutral">any category</Pill>}
                    <Pill tone="teal">Pass holders only</Pill>
                    {a.key === 'payables' && ap4m?.channel && <Pill tone="ok">Mastercard channel {Number(ap4m.channel.cap)} RLUSD</Pill>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Mandate v{m.version} · until {m.validUntil.slice(0, 10)} · signed by the business</span>
                    <span className="flex items-center gap-3">
                      <Link to={`/agents/${a.key}/train`} className="inline-flex items-center gap-1 font-semibold text-tealink hover:underline">Train agent <ChevronRight className="h-3.5 w-3.5" /></Link>
                      <Link to={`/agents/${a.address}`} className="inline-flex items-center gap-1 font-semibold text-tealink hover:underline">Flow Check <ChevronRight className="h-3.5 w-3.5" /></Link>
                    </span>
                  </div>
                </div>
              ) : <p className="mt-4 text-sm text-muted">No Mandate published.</p>}
            </Card>
          );
        })}
      </div>

      <Card title="Rails">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { name: 'XRP Ledger · RLUSD', detail: 'Suppliers with a Pass', live: true },
            { name: 'Mastercard Agent Pay for Machines', detail: ap4m?.channel ? `Funded channel · ${ap4m.channel.status}` : 'Funded channel on XRPL EVM', live: !!ap4m?.enabled },
            { name: 'Ripple Payments Direct', detail: 'Cross-border fiat payouts (Ripple mock until UAT access)', live: true },
          ].map((r) => (
            <div key={r.name} className="flex items-start justify-between gap-2 rounded-xl border border-line px-3 py-3">
              <div><div className="text-sm font-semibold">{r.name}</div><div className="text-xs text-muted">{r.detail}</div></div>
              <Pill tone={r.live ? 'ok' : 'neutral'}>{r.live ? 'live' : 'roadmap'}</Pill>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted">Flow Check decides whether the agent may pay; routing picks the rail.</div>
      </Card>

      <Card title="Where the business connects">
        <div className="grid gap-3 sm:grid-cols-4">
          {[{ icon: Globe, name: 'Web app', live: true }, { icon: Code2, name: 'API', live: true }, { icon: Plug, name: 'MCP (Flow Check tools)', live: true }, { icon: Puzzle, name: 'Widget', live: false }].map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><c.icon className="h-4 w-4 text-tealink" />{c.name}</span>
              <Pill tone={c.live ? 'ok' : 'neutral'}>{c.live ? 'live' : 'roadmap'}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
