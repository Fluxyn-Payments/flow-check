import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, ChevronRight, Clock, Code2, Globe, Megaphone, Plug, Plus, Puzzle, Route, UserRound, Users } from 'lucide-react';
import { useApi } from '../api';
import { Loading } from '../components/ui';
import { MastercardMark } from './Workspace';
import { RippleMark } from '../components/RippleMark';

type Limits = { currency: string; perPayment: number; daily: number; monthly: number; quarterly?: number };
export type AgentConfig = { rails: { xrpl: boolean; ap4m: boolean; ripple: boolean }; channels: { mcp: boolean; widget: boolean; api: boolean } };
export type AgentRow = {
  key: 'payables' | 'marketing'; address: string; authorized: boolean; delegated: boolean; evm: string | null;
  mandate: null | { version: number; validUntil: string; limits: Limits; categories?: string[]; permissions: { pay: string; collect: string; treasury: string } };
  spent: { today: number; month: number; quarter?: number } | null;
  config: AgentConfig;
};

export const AGENT_META = {
  payables: { name: 'Payables agent', blurb: 'Pays supplier invoices and manages payables.', icon: Bot, user: 'CFO', email: 'cfo@demo.fluxyn.com' },
  marketing: { name: 'Marketing agent', blurb: 'Design, ads and events, within a quarterly budget.', icon: Megaphone, user: 'Marketing lead', email: 'marketing@demo.fluxyn.com' },
} as const;

export const usd = (n: number) => `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function KyaPill({ a }: { a: Pick<AgentRow, 'authorized' | 'delegated'> }) {
  const [label, cls] = a.authorized ? ['KYA · AUTHORIZED', 'bg-leaf/15 text-leaf'] : !a.delegated ? ['PAUSED BY THE CFO', 'bg-sunsoft text-sun'] : ['NOT AUTHORIZED', 'bg-dangersoft text-danger'];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 font-mono text-[11px] font-bold tracking-wide ${cls}`}>{label}</span>;
}

function Stat({ icon: Icon, tone, label, value, hint, to }: { icon: typeof Users; tone: string; label: string; value: string; hint: string; to?: string }) {
  const body = (
    <div className="flex items-center gap-5 rounded-2xl border border-line bg-surface p-5 shadow-lift">
      <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon className="h-7 w-7" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-muted">{label}</span>
        <span className="num block font-display text-[28px] font-bold leading-tight">{value}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      {to && <ChevronRight className="h-5 w-5 text-muted" />}
    </div>
  );
  return to ? <Link to={to} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
}

function Tile({ icon, name, detail, status = 'Live' }: { icon: React.ReactNode; name: string; detail?: string; status?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center text-tealink">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{name}</span>{detail && <span className="block truncate text-xs text-muted">{detail}</span>}</span>
      <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${status === 'Live' ? 'bg-leaf/15 text-leaf' : 'bg-sunken text-muted'}`}>{status}</span>
    </div>
  );
}

export function Agents() {
  const { data: agents } = useApi<AgentRow[]>('/api/business/agents');
  const monthSpend = agents?.reduce((s, a) => s + (a.spent?.month ?? 0), 0) ?? 0;
  const monthLimit = agents?.reduce((s, a) => s + (a.mandate?.limits.monthly ?? 0), 0) ?? 0;
  const active = agents?.filter((a) => a.authorized).length ?? 0;

  return (
    <div className="space-y-8">
      <div className="rise">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-[44px]">Agents and budgets</h1>
        <p className="mt-2 text-lg text-muted">The CFO creates agents, sets their limits and approves what goes over. Team members only see their own agent.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={Users} tone="bg-mint text-tealink" label="Active agents" value={agents ? String(active) : '—'} hint={`of ${agents?.length ?? '—'} configured`} />
        <Stat icon={BarChart3} tone="bg-mint text-tealink" label="Spent this month" value={agents ? usd(monthSpend) : '—'} hint={`of ${usd(monthLimit)} in Mandates`} />
        <Stat icon={Clock} tone="bg-sunsoft text-sun" label="Approvals" value="Workspace" hint="over-limit payments wait for you" to="/workspace" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Your agents</h2>
        <span title="New agents need an attestation from your issuer (PSP or VASP): coming soon" className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-semibold text-tealink/70"><Plus className="h-4 w-4" />Create agent <span className="rounded-full bg-surface px-1.5 font-mono text-[10px]">soon</span></span>
      </div>

      {!agents && <Loading />}
      <div className="grid gap-6 lg:grid-cols-2">
        {agents?.map((a) => {
          const meta = AGENT_META[a.key];
          const m = a.mandate;
          const budget = m?.limits.quarterly ? { label: 'Quarter budget', used: a.spent?.quarter ?? 0, limit: m.limits.quarterly } : { label: 'Monthly budget', used: a.spent?.month ?? 0, limit: m?.limits.monthly ?? 0 };
          return (
            <section key={a.key} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-lift">
              <div className="flex items-start gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-mint text-tealink"><meta.icon className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xl font-bold">{meta.name}</h3>
                    <KyaPill a={a} />
                  </div>
                  <p className="mt-1 text-[15px] text-muted">{meta.blurb}</p>
                </div>
              </div>
              <p className="mt-4 flex items-center gap-2 text-[15px] text-muted"><UserRound className="h-4 w-4" />{meta.user} · {meta.email}</p>
              {m && (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-[15px]"><span className="font-semibold">{budget.label}</span><span className="num text-muted">{usd(budget.used)} of {usd(budget.limit)}</span></div>
                  <div className="mt-2 h-2 rounded-full bg-sunken"><div className="h-2 rounded-full bg-teal" style={{ width: `${Math.max(1.5, Math.min(100, (budget.used / budget.limit) * 100))}%` }} /></div>
                  <p className="mt-2 text-xs text-muted">Pays alone up to {usd(m.limits.perPayment)} · Mandate v{m.version}, signed by the business</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {m?.categories ? m.categories.map((c) => <span key={c} className="rounded-full bg-sunken px-3 py-1 text-sm capitalize">{c}</span>) : <span className="rounded-full bg-sunken px-3 py-1 text-sm">Any category</span>}
                <span className="rounded-full bg-mint px-3 py-1 text-sm text-tealink">Pass holders only</span>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                <Link to={`/agents/${a.key}/manage`} className="inline-flex items-center gap-2 font-semibold text-tealink hover:underline">Manage agent <ArrowRight className="h-4 w-4" /></Link>
                <span className="flex gap-1.5 text-xs text-muted">
                  {a.config.rails.xrpl && <span className="rounded-full border border-line px-2 py-0.5">XRPL</span>}
                  {a.config.rails.ap4m && a.key === 'payables' && <span className="rounded-full border border-line px-2 py-0.5">Mastercard</span>}
                  {a.config.rails.ripple && <span className="rounded-full border border-line px-2 py-0.5">Ripple</span>}
                </span>
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-lift">
          <h2 className="flex items-baseline gap-3 text-lg font-bold"><Route className="h-5 w-5 self-center text-tealink" />Payment rails <span className="text-sm font-normal text-muted">Agents pay on these rails</span></h2>
          <div className="mt-4 grid gap-3">
            <Tile icon={<RippleMark />} name="XRPL · RLUSD" detail="Suppliers with a Pass" />
            <Tile icon={<MastercardMark size={16} />} name="Mastercard Agent Pay" detail="Funded channel" />
            <Tile icon={<RippleMark />} name="Ripple Payments Direct" detail="Cross-border payouts" status="Sandbox" />
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-lift">
          <h2 className="flex items-baseline gap-3 text-lg font-bold"><Plug className="h-5 w-5 self-center text-tealink" />Channels <span className="text-sm font-normal text-muted">Where the business connects</span></h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile icon={<Globe className="h-5 w-5" />} name="Web app" />
            <Tile icon={<Code2 className="h-5 w-5" />} name="API" />
            <Tile icon={<Puzzle className="h-5 w-5" />} name="Widget" />
            <Tile icon={<Plug className="h-5 w-5" />} name="MCP" />
          </div>
          <Link to="/integrations" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tealink hover:underline">Integrations and ERP <ChevronRight className="h-4 w-4" /></Link>
        </section>
      </div>
    </div>
  );
}
