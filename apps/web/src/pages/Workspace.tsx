import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Check, CircleSlash, Clock, ExternalLink, Loader2, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import { api, useApi, type AgentResult } from '../api';
import { Pill } from '../components/ui';
import { getSession } from '../session';

type Bill = { id: string; vendor: string; destination: string; amount: number; currency: string; category: string };
type Step = { tool: string; input: Record<string, unknown>; output: Record<string, unknown> };
type AgentRun = { model: string; reply: string; steps: Step[] };
type PayOutput = { bill?: string; decision?: string; status?: string; engineResult?: string; explorer?: string; failed?: string[] };
type MandateView = { mandate: null | { limits: { perPayment: number; daily: number; monthly: number; quarterly?: number }; categories?: string[] }; spent: { today: number; month: number; quarter?: number } | null };
type Ap4m = { enabled: boolean; channel?: { id: string; cap: string; status: string; lastVoucher: string | null } | null; budget?: { cap: string } };
type Msg = { id: number; from: 'user' | 'agent'; node: ReactNode };

const SUGGESTIONS = ["Pay this month's bills", 'What can you pay on your own?', 'Does Stratus Cloud LLC have a Pass?', 'What is waiting for my approval?'];
const usd = (n: number) => `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening'; };
const rlusd = (wei?: string | null) => (wei ? Number(BigInt(wei.split('.')[0]) / 10n ** 12n) / 1e6 : 0);

export function MastercardMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 32 20" aria-label="Mastercard" role="img">
      <circle cx="12" cy="10" r="8" fill="#EB001B" />
      <circle cx="20" cy="10" r="8" fill="#F79E1B" />
      <path d="M16 3.6a8 8 0 0 1 0 12.8 8 8 0 0 1 0-12.8z" fill="#FF5F00" />
    </svg>
  );
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'no'; icon: typeof Check }> = {
  PAID: { label: 'Paid', tone: 'ok', icon: Check },
  PENDING_APPROVAL: { label: 'Needs your approval', tone: 'warn', icon: Clock },
  REFUSED: { label: 'Refused by Flow Check', tone: 'no', icon: CircleSlash },
  REFUSED_BY_LEDGER: { label: 'Refused by the ledger', tone: 'no', icon: XCircle },
  FAILED: { label: 'Failed', tone: 'no', icon: XCircle },
  ALLOW: { label: 'Can pay on its own', tone: 'ok', icon: Check },
  NEEDS_APPROVAL: { label: 'Will need your approval', tone: 'warn', icon: Clock },
  DENY: { label: 'Refused by Flow Check', tone: 'no', icon: CircleSlash },
};

// Short, plain answers: the cards above already show each bill
const clean = (s: string) => s.replace(/\*\*/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\n{2,}/g, '\n').trim();

function Outcome({ o, bill }: { o: PayOutput; bill?: Bill }) {
  const s = STATUS[o.status ?? o.decision ?? ''] ?? { label: o.status ?? o.decision ?? '—', tone: 'warn' as const, icon: Clock };
  const tone = { ok: 'bg-leaf/15 text-leaf', warn: 'bg-sunsoft text-sun', no: 'bg-dangersoft text-danger' }[s.tone];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${tone}`}><s.icon className="h-3.5 w-3.5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{bill?.vendor ?? o.bill}</span>
        <span className="block text-xs text-muted">{s.label}{o.failed?.length ? ` · ${o.failed[0].split(':').slice(1).join(':').trim()}` : ''}</span>
        {o.explorer && <a href={o.explorer} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-tealink hover:underline">{o.engineResult} <ExternalLink className="h-3 w-3" /></a>}
      </span>
      {bill && <span className="num font-mono text-[13px]">{bill.amount.toLocaleString('en-US')} {bill.currency}</span>}
    </li>
  );
}

export function Workspace() {
  const session = getSession();
  const { data: net } = useApi<{ agent: string; business: string; agentKey: 'payables' | 'marketing'; canApprove: boolean }>('/api/me');
  const isMarketing = net?.agentKey === 'marketing';
  const agentName = isMarketing ? 'Marketing agent' : 'Payables agent';
  const { data: kya, reload: reloadKya } = useApi<AgentResult & { evm?: string | null }>(net ? `/api/agent/${net.agent}` : null);
  const { data: md, reload: reloadMd } = useApi<MandateView>(net ? `/api/mandate/${net.agent}` : null);
  const { data: bills } = useApi<Bill[]>('/api/bills');
  const { data: ap4m } = useApi<Ap4m>('/api/ap4m', 30000);
  const [outcomes, setOutcomes] = useState<Record<string, PayOutput>>({});
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [bypass, setBypass] = useState<PayOutput | null>(null);
  const idRef = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [msgs, typing]);
  const push = (from: Msg['from'], node: ReactNode) => setMsgs((m) => [...m, { id: ++idRef.current, from, node }]);
  const billOf = (id?: string) => bills?.find((b) => b.id === id);

  async function say(text: string) {
    if (typing || !text.trim()) return;
    push('user', text);
    setInput('');
    setTyping(true);
    try {
      const r = await api<AgentRun>('/api/agent/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const pays = r.steps.filter((s) => s.tool === 'pay_with_pass').map((s) => s.output as PayOutput);
      if (pays.length) setOutcomes((x) => ({ ...x, ...Object.fromEntries(pays.filter((p) => p.bill).map((p) => [p.bill!, p])) }));
      // Dry-run checks become cards too, unless the same bill was paid in this run
      const paidIds = new Set(pays.map((p) => p.bill));
      const checks = r.steps.filter((s) => s.tool === 'check_mandate').map((s) => s.output as PayOutput).filter((c) => c.bill && !paidIds.has(c.bill));
      if (checks.length) setChecks((x) => ({ ...x, ...Object.fromEntries(checks.map((c) => [c.bill!, c.decision ?? ''])) }));
      const cards = [...pays, ...checks];
      const checked = r.steps.some((s) => s.tool === 'verify_agent');
      push('agent', (
        <>
          {checked && <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-tealink"><Check className="h-3.5 w-3.5" />Checked its own identity on the ledger first</p>}
          {cards.length > 0 && <ul className="-my-1 mb-2 divide-y divide-line">{cards.map((p, i) => <Outcome key={i} o={p} bill={billOf(p.bill)} />)}</ul>}
          <p className="whitespace-pre-wrap">{clean(r.reply)}</p>
          <p className="mt-2 font-mono text-[11px] text-muted">{r.model.replace('us.anthropic.', '')} · Amazon Bedrock</p>
        </>
      ));
      reloadMd();
    } catch (e) {
      push('agent', <p className="text-danger">{(e as Error).message}</p>);
    } finally {
      setTyping(false);
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void say(input); };

  // The CFO approves everything pending in one atomic Batch on the ledger
  const approve = async () => {
    const ids = Object.keys(outcomes).filter((k) => outcomes[k].status === 'PENDING_APPROVAL');
    if (!ids.length) return;
    setBusy('approve');
    try {
      const r = await api<PayOutput & { bills?: string[]; mode?: string }>('/api/business/approve-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: net?.agentKey, bills: ids }) });
      const done = r.bills ?? [];
      setOutcomes((x) => ({ ...x, ...Object.fromEntries(done.map((id) => [id, { ...r, bill: id, failed: [] }])) }));
      push('agent', <><p className="font-semibold">Approved in one batch ({r.mode ?? 'all or nothing'}, simulated signature).</p><ul className="divide-y divide-line">{done.map((id) => <Outcome key={id} o={{ ...r, bill: id, failed: [] }} bill={billOf(id)} />)}</ul></>);
      reloadMd();
    } catch (e) {
      push('agent', <p className="text-danger">{(e as Error).message}</p>);
    } finally { setBusy(null); }
  };

  // Quick actions from what the agent found
  const quick: { label: string; run: () => void }[] = [];
  const paidOrPending = (id: string) => !!outcomes[id];
  for (const b of bills ?? []) if (checks[b.id] === 'ALLOW' && !paidOrPending(b.id)) quick.push({ label: `Pay ${b.vendor}`, run: () => say(`Pay ${b.id} (${b.vendor}) now.`) });
  if (net?.canApprove && Object.values(outcomes).some((o) => o.status === 'PENDING_APPROVAL')) quick.push({ label: 'Approve pending · one batch', run: approve });
  if (!Object.keys(outcomes).length) quick.push({ label: "Pay this month's bills", run: () => say("Pay this month's bills") });
  quick.push({ label: 'How much budget is left?', run: () => say('How much budget is left this month?') });

  const tryBypass = async () => {
    setBusy('bypass');
    try { setBypass(await api<PayOutput>('/api/demo/3b', { method: 'POST' })); } finally { setBusy(null); reloadKya(); }
  };

  const pendingId = Object.keys(outcomes).find((k) => outcomes[k].status === 'PENDING_APPROVAL');
  const pending = !!pendingId;
  const pendingBill = billOf(pendingId);
  const m = md?.mandate;
  const first = session?.name ?? 'there';
  const cap = ap4m?.channel ? Number(ap4m.channel.cap) : 0;
  const used = rlusd(ap4m?.channel?.lastVoucher);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-[600px] flex-col rounded-2xl border border-line bg-surface shadow-lift lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]" aria-label={agentName}>
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-mint text-tealink"><Sparkles className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{agentName}</p>
            <p className="truncate text-xs text-muted">{m ? `Pays alone up to ${usd(m.limits.perPayment)}${m.categories ? ` · only ${m.categories.join(', ')}` : ''} · only counterparties with a Pass` : 'Your agent, checked by Flow Check'}</p>
          </div>
          {kya && <Pill tone={kya.authorized ? 'ok' : 'no'}>{kya.authorized ? 'KYA · AUTHORIZED' : 'NOT AUTHORIZED'}</Pill>}
          {net?.canApprove && <Link to="/agents" className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-sunken">Mandate and limits</Link>}
        </header>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
          <div className="rise max-w-[85%]">
            <h2 className="text-[28px] font-extrabold leading-tight">{greeting()}, {first}.</h2>
            <p className="mt-1 text-lg text-muted">What should we pay today?</p>
            {bills && <p className="mt-2 text-sm">{bills.length} bills are due this month. I check every one with Flow Check before any money moves.</p>}
          </div>
          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => say(s)} className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold hover:border-teal hover:bg-mint hover:text-tealink">{s}</button>
              ))}
            </div>
          )}
          {msgs.map((x) => x.from === 'user' ? (
            <div key={x.id} className="rise ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-teal px-4 py-2.5 font-semibold text-onteal">{x.node}</div>
          ) : (
            <div key={x.id} className="rise max-w-[94%] rounded-2xl rounded-bl-md bg-sunken px-4 py-3.5 text-[15px]">{x.node}</div>
          ))}
          {typing && (
            <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-sunken px-4 py-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> checking with Flow Check…
            </div>
          )}
          {msgs.length > 0 && !typing && (
            <div className="flex flex-wrap gap-2 pt-1">
              {quick.slice(0, 4).map((q, i) => (
                <button key={q.label} type="button" onClick={q.run} disabled={!!busy}
                  className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${i === 0 ? 'bg-teal text-onteal hover:brightness-95' : 'border border-line bg-paper hover:border-teal hover:bg-mint hover:text-tealink'}`}>{busy === 'approve' && q.label.startsWith('Approve') ? 'Signing the batch…' : q.label}</button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="border-t border-line p-3">
          <div className="flex items-center gap-2 rounded-full border border-line bg-paper pl-4 pr-1.5 focus-within:border-teal">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your agent or tell it what to pay…"
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted/70 focus:outline-none" aria-label="Message to the agent" />
            <button type="submit" disabled={!input.trim() || typing} className="grid h-9 w-9 place-items-center rounded-full bg-teal text-onteal disabled:opacity-40" aria-label="Send">
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>
      </section>

      <aside className="grid content-start gap-6">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">{isMarketing ? 'Budget' : 'This month'}</h2>
            {net?.canApprove && <Link to="/agents" className="text-xs font-semibold text-tealink">Limits</Link>}
          </div>
          {m && md?.spent ? (
            <div className="mt-4 grid gap-4">
              {[{ label: 'Paid today', used: md.spent.today, limit: m.limits.daily }, { label: 'Paid this month', used: md.spent.month, limit: m.limits.monthly }, ...(m.limits.quarterly ? [{ label: 'Quarter budget', used: md.spent.quarter ?? 0, limit: m.limits.quarterly }] : [])].map((r) => (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-semibold">{r.label}</span><span className="num font-display text-xl font-bold">{usd(r.used)}</span></div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-teal" style={{ width: `${Math.max(1, Math.min(100, (r.used / r.limit) * 100))}%` }} /></div>
                  <div className="mt-1 text-xs text-muted">of {usd(r.limit)}</div>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-muted">Reading the ledger…</p>}
        </section>

        {!isMarketing && <section aria-label="Agent spend channel" className="relative overflow-hidden rounded-2xl bg-[rgb(6_40_40)] p-5 text-[rgb(226_247_243)]">
          <div aria-hidden="true" className="absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-50 blur-2xl" style={{ background: 'radial-gradient(circle, rgb(20 201 192 / .7), transparent 65%)' }} />
          <div className="relative flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(120_230_210)]">Agent spend channel</span>
            <MastercardMark />
          </div>
          <p className="num relative mt-7 font-display text-3xl font-bold">{cap ? `${(cap - used).toLocaleString('en-US')} RLUSD` : '—'}</p>
          <p className="relative text-xs text-[rgb(150_190_184)]">left of a {cap || '—'} RLUSD prefunded cap · Agent Pay for Machines</p>
          <div className="relative mt-4 flex items-end justify-between text-xs">
            <span className="font-semibold tracking-[0.12em]">LUMEN ROBOTICS · PAYABLES AGENT</span>
            <span className="font-mono">{kya?.evm ? `${kya.evm.slice(0, 6)}…${kya.evm.slice(-4)}` : ''}</span>
          </div>
        </section>}

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-bold">Bills due</h2>
          <ul className="mt-2 divide-y divide-line">
            {bills?.map((b) => {
              const o = outcomes[b.id];
              const s = o ? STATUS[o.status ?? ''] : null;
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{b.vendor}</span>
                    <span className="text-xs text-muted">{b.id} · {s ? s.label : 'To pay'}</span>
                  </span>
                  <span className="num font-mono text-[13px]">{b.amount.toLocaleString('en-US')}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={`rounded-2xl border p-5 ${pending ? 'border-sun/40 bg-sunsoft' : 'border-line bg-surface'}`}>
          <h2 className="text-lg font-bold">Approvals</h2>
          {pending ? (
            <>
              <p className="mt-2 text-sm"><span className="font-semibold">{pendingBill?.vendor} · {pendingBill?.amount.toLocaleString('en-US')} RLUSD.</span> {outcomes[pendingId!]?.failed?.[0] ?? 'Over the limit.'}</p>
              {net?.canApprove
                ? <button onClick={approve} disabled={!!busy} className="mt-3 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-50">{busy === 'approve' ? 'Signing the batch…' : 'Approve all · one batch (simulated)'}</button>
                : <p className="mt-2 text-xs font-semibold text-sun">Sent to the CFO for approval.</p>}
            </>
          ) : <p className="mt-2 text-sm text-muted">Nothing waiting for you.</p>}
          <p className="mt-3 text-xs text-muted"><Pill tone="warn">simulated approval</Pill> Signed with the business key on the server. In production the CFO signs on a Ledger device.</p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="h-5 w-5 text-danger" />Try to bypass</h2>
          <p className="mt-2 text-sm text-muted">An agent without KYA pays a verified supplier directly, skipping Flow Check. Only the ledger stands in the way.</p>
          {bypass ? (
            <p className="mt-3 text-sm"><Pill tone="no">{bypass.engineResult ?? 'refused'}</Pill> {bypass.explorer && <a href={bypass.explorer} target="_blank" rel="noopener" className="font-semibold text-tealink hover:underline">view ↗</a>}</p>
          ) : (
            <button onClick={tryBypass} disabled={!!busy} className="mt-3 inline-flex h-10 items-center rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50">{busy === 'bypass' ? 'Sending…' : 'Send it'}</button>
          )}
        </section>
      </aside>
    </div>
  );
}
