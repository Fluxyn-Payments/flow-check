import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Code2, ExternalLink, FileSignature, GraduationCap, Loader2, PauseCircle, PlayCircle, Plug, Puzzle, Route } from 'lucide-react';
import { api, useApi } from '../api';
import { Addr, Card, Loading } from '../components/ui';
import { AgentMcp } from '../components/AgentMcp';
import { RippleMark } from '../components/RippleMark';
import { MastercardMark } from './Workspace';
import { AGENT_META, KyaPill, type AgentConfig, type AgentRow } from './Agents';

type Tx = { label: string; engineResult: string; explorer: string };
const field = 'h-11 w-full rounded-xl border border-line bg-paper px-3 text-[15px] focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30';

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-teal' : 'bg-line'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Row({ icon, title, detail, children }: { icon: ReactNode; title: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mint text-tealink">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{detail}</span></span>
      {children}
    </div>
  );
}

const TxList = ({ txs }: { txs: Tx[] }) => (
  <ul className="mt-3 space-y-1 text-sm">{txs.map((t) => <li key={t.explorer}><a href={t.explorer} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-tealink hover:underline">{t.label} · {t.engineResult} <ExternalLink className="h-3 w-3" /></a></li>)}</ul>
);

// The CFO administers one agent: its Mandate, rails, channels, training, and whether it may pay at all
export function AgentManage() {
  const { agentKey = 'payables' } = useParams();
  const key = agentKey === 'marketing' ? 'marketing' : 'payables';
  const meta = AGENT_META[key];
  const { data: agents, reload } = useApi<AgentRow[]>('/api/business/agents');
  const a = agents?.find((x) => x.key === key);
  const m = a?.mandate;

  const [form, setForm] = useState({ perPayment: '', daily: '', monthly: '', quarterly: '', categories: '' });
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<ReactNode>(null);

  useEffect(() => {
    if (!m) return;
    setForm({ perPayment: String(m.limits.perPayment), daily: String(m.limits.daily), monthly: String(m.limits.monthly), quarterly: m.limits.quarterly ? String(m.limits.quarterly) : '', categories: (m.categories ?? []).join(', ') });
  }, [m?.version]);
  useEffect(() => { if (a) setCfg(a.config); }, [a?.key, agents]);

  const publish = async () => {
    setBusy('mandate'); setMsg(null);
    try {
      const r = await api<{ version: number; txs: Tx[] }>(`/api/agents/${key}/mandate`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ perPayment: Number(form.perPayment), daily: Number(form.daily), monthly: Number(form.monthly), quarterly: form.quarterly ? Number(form.quarterly) : null, categories: form.categories.trim() ? form.categories.split(',') : null }),
      });
      setMsg(<><p className="font-semibold">Mandate v{r.version} signed and anchored on the ledger.</p><TxList txs={r.txs} /></>);
      reload();
    } catch (e) { setMsg(<p className="text-danger">{(e as Error).message}</p>); } finally { setBusy(null); }
  };

  const saveConfig = async (next: AgentConfig) => {
    setCfg(next); setBusy('config');
    try { setCfg(await api<AgentConfig>(`/api/agents/${key}/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })); } finally { setBusy(null); }
  };

  const delegation = async (enabled: boolean) => {
    setBusy('delegation'); setMsg(null);
    try {
      const r = await api<{ engineResult: string; explorer: string }>(`/api/agents/${key}/delegation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
      setMsg(<><p className="font-semibold">{enabled ? 'Agent restored: the business delegated payments again.' : 'Agent paused: the business removed its payment delegation.'}</p><TxList txs={[{ label: 'DelegateSet', engineResult: r.engineResult, explorer: r.explorer }]} /></>);
      reload();
    } catch (e) { setMsg(<p className="text-danger">{(e as Error).message}</p>); } finally { setBusy(null); }
  };

  if (!agents) return <Loading />;
  if (!a) return <Card><p className="text-sm text-muted">Agent not found.</p></Card>;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <Link to="/agents" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Agents and budgets</Link>
      <div className="rise flex flex-wrap items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-mint text-tealink"><meta.icon className="h-7 w-7" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{meta.name}</h1>
          <p className="mt-1 text-muted">{meta.user} · {meta.email} · XRPL <Addr value={a.address} /></p>
        </div>
        <KyaPill a={a} />
      </div>
      {msg && <div className="rounded-2xl border border-line bg-surface p-4 text-sm shadow-lift">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Mandate" icon={FileSignature} action={m && <span className="text-xs text-muted">v{m.version} · until {m.validUntil.slice(0, 10)}</span>}>
          <div className="grid gap-4 sm:grid-cols-2">
            {([['perPayment', 'Pays alone up to (USD)'], ['daily', 'Daily limit'], ['monthly', 'Monthly limit'], ['quarterly', 'Quarter budget (optional)']] as const).map(([k, label]) => (
              <label key={k} className="grid gap-1.5 text-sm font-semibold">{label}<input inputMode="numeric" value={form[k]} onChange={set(k)} className={`${field} num`} /></label>
            ))}
            <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Allowed categories <span className="font-normal text-muted">comma separated; empty means any</span>
              <input value={form.categories} onChange={set('categories')} placeholder="ads, design, events" className={field} />
            </label>
          </div>
          <p className="mt-4 text-xs text-muted">Publishing signs a new version with the business key and anchors its hash on the agent's DID and in the business's Mandate set. Flow Check applies it on the next payment.</p>
          <button onClick={publish} disabled={!!busy} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-teal px-5 font-semibold text-onteal disabled:opacity-50">
            {busy === 'mandate' ? <><Loader2 className="h-4 w-4 animate-spin" />Anchoring on the ledger…</> : 'Sign and publish new version'}
          </button>
        </Card>

        <div className="grid content-start gap-6">
          <Card title="Payment rails" icon={Route}>
            <div className="divide-y divide-line">
              <Row icon={<RippleMark />} title="XRP Ledger · RLUSD" detail="Suppliers with a Pass"><Toggle on={!!cfg?.rails.xrpl} disabled={busy === 'config'} onChange={(v) => cfg && saveConfig({ ...cfg, rails: { ...cfg.rails, xrpl: v } })} /></Row>
              {key === 'payables' && <Row icon={<MastercardMark size={14} />} title="Mastercard Agent Pay" detail="Prefunded channel on XRPL EVM"><Toggle on={!!cfg?.rails.ap4m} disabled={busy === 'config'} onChange={(v) => cfg && saveConfig({ ...cfg, rails: { ...cfg.rails, ap4m: v } })} /></Row>}
              <Row icon={<RippleMark />} title="Ripple Payments Direct" detail="Fiat payouts · sandbox"><Toggle on={!!cfg?.rails.ripple} disabled={busy === 'config'} onChange={(v) => cfg && saveConfig({ ...cfg, rails: { ...cfg.rails, ripple: v } })} /></Row>
            </div>
          </Card>
          <Card title="Channels" icon={Plug}>
            <div className="divide-y divide-line">
              <Row icon={<Plug className="h-5 w-5" />} title="MCP" detail="Claude, ChatGPT"><Toggle on={!!cfg?.channels.mcp} disabled={busy === 'config'} onChange={(v) => cfg && saveConfig({ ...cfg, channels: { ...cfg.channels, mcp: v } })} /></Row>
              <Row icon={<Puzzle className="h-5 w-5" />} title="Widget" detail="Inside a bank or ERP web app"><Toggle on={!!cfg?.channels.widget} disabled={busy === 'config'} onChange={(v) => cfg && saveConfig({ ...cfg, channels: { ...cfg.channels, widget: v } })} /></Row>
              <Row icon={<Code2 className="h-5 w-5" />} title="REST API" detail="POST /api/v1/agent/run with the agent key"><Toggle on={!!cfg?.channels.api} disabled={busy === 'config'} onChange={(v) => cfg && saveConfig({ ...cfg, channels: { ...cfg.channels, api: v } })} /></Row>
            </div>
            <AgentMcp agent={key} />
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Training" icon={GraduationCap}>
          <p className="text-sm text-muted">Instructions, known suppliers and reference documents. They shape what the agent proposes; the Mandate still decides.</p>
          <Link to={`/agents/${key}/train`} className="mt-4 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-sunken">Train agent</Link>
        </Card>
        <Card title={a.delegated ? 'Pause this agent' : 'Restore this agent'} icon={a.delegated ? PauseCircle : PlayCircle} className={a.delegated ? 'border-danger/30' : ''}>
          <p className="text-sm text-muted">{a.delegated
            ? 'Removes the business\'s payment delegation on the ledger (DelegateSet). The agent keeps its identity, but every payment is refused until you restore it.'
            : 'Delegates payments to the agent again. Its Mandate and issuer attestation still apply.'}</p>
          <button onClick={() => delegation(!a.delegated)} disabled={!!busy}
            className={`mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${a.delegated ? 'border border-danger text-danger hover:bg-dangersoft' : 'bg-teal text-onteal'}`}>
            {busy === 'delegation' ? <Loader2 className="h-4 w-4 animate-spin" /> : a.delegated ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {a.delegated ? 'Pause agent' : 'Restore agent'}
          </button>
          <p className="mt-3 text-xs text-muted">The issuer (your PSP or VASP) can also revoke the agent's attestation from its console.</p>
        </Card>
      </div>
    </div>
  );
}
