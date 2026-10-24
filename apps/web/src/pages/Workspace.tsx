import { useEffect, useState } from 'react';
import { Bot, KeyRound, ShieldAlert } from 'lucide-react';
import { api, useApi, type AgentResult, type Check } from '../api';
import { Activity } from '../components/Activity';
import { Addr, Card, Checks, Pill } from '../components/ui';

type Network = { agent: string; business: string; suppliers: { a: string; b: string }; vendor: string; rogue: string };
type AgentRun = { model: string; reply: string; steps: { tool: string; input: unknown; output: unknown }[] };
type SceneResult = { status?: string; decision?: string; engineResult?: string; explorer?: string | null; checks?: Check[]; kya?: AgentResult; error?: string };

// This month's bills for the demo business. Demo data: the payments themselves are real on testnet.
const BILLS = [
  { scene: '1', vendor: 'Cloud provider', note: 'Supplier with a Pass', amount: 1200, to: (n: Network) => n.suppliers.a },
  { scene: '2', vendor: 'Design studio', note: 'Over the per-payment limit', amount: 6000, to: (n: Network) => n.suppliers.b },
  { scene: '3a', vendor: 'New vendor', note: 'No Pass', amount: 300, to: (n: Network) => n.vendor },
];

const tone = (s?: string) => (s === 'PAID' ? 'ok' : s === 'PENDING_APPROVAL' ? 'warn' : s ? 'no' : 'neutral');
const label = (s?: string) => ({ PAID: 'Paid', PENDING_APPROVAL: 'Needs approval', REFUSED: 'Refused by Flow Check', REFUSED_BY_LEDGER: 'Refused by the ledger', FAILED: 'Failed' } as Record<string, string>)[s ?? ''] ?? 'To pay';

export function Workspace() {
  const { data: net } = useApi<Network>('/api/network');
  const { data: kya } = useApi<AgentResult>(net ? `/api/agent/${net.agent}` : null);
  const [token, setToken] = useState(() => { try { return localStorage.getItem('fc-token') ?? ''; } catch { return ''; } });
  const [results, setResults] = useState<Record<string, SceneResult>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem('fc-token', token); } catch { /* private mode */ } }, [token]);

  const run = async (scene: string) => {
    setBusy(scene);
    try {
      const r = await api<SceneResult>(`/api/demo/${scene}`, { method: 'POST', headers: { 'x-demo-token': token } });
      setResults((x) => ({ ...x, [scene === '2-approve' ? '2' : scene]: r }));
    } catch (e) {
      setResults((x) => ({ ...x, [scene]: { error: (e as Error).message } }));
    } finally {
      setBusy(null);
    }
  };

  const [prompt, setPrompt] = useState("Pay this month's bills.");
  const [chat, setChat] = useState<AgentRun | null>(null);
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const ask = async () => {
    setThinking(true); setChatError(null); setChat(null);
    try {
      const r = await api<AgentRun>('/api/agent/run', { method: 'POST', headers: { 'x-demo-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ message: prompt }) });
      setChat(r);
      // The agent's payments update the bills below
      const byBill: Record<string, string> = { 'INV-1042': '1', 'INV-1043': '2', 'INV-1044': '3a' };
      const next: Record<string, SceneResult> = {};
      for (const s of r.steps) {
        if (s.tool !== 'pay_with_pass') continue;
        const o = s.output as SceneResult & { bill?: string; failed?: string[] };
        const key = o.bill && byBill[o.bill];
        if (key) next[key] = { ...o, checks: (o.failed ?? []).map((f, i) => ({ id: String(i), label: f.split(':')[0], detail: f.split(':').slice(1).join(':').trim(), ok: false, effect: o.decision === 'DENY' ? 'DENY' : 'APPROVAL' })) };
      }
      setResults((x) => ({ ...x, ...next }));
    } catch (e) {
      setChatError((e as Error).message);
    } finally {
      setThinking(false);
    }
  };

  const pending = results['2']?.status === 'PENDING_APPROVAL';

  return (
    <div className="space-y-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Agent workspace</h1>
          <p className="mt-2 max-w-2xl text-muted">The CFO asks the agent to pay this month's bills. Flow Check decides each one before any money moves: pay, ask for approval, or refuse.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <KeyRound className="h-4 w-4" />
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="Demo token" autoComplete="off" className="w-40 rounded-xl border border-line bg-surface px-3 py-1.5 text-ink" />
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <Card title="The agent" action={kya && <Pill tone={kya.authorized ? 'ok' : 'no'}>{kya.authorized ? 'KYA · AUTHORIZED' : 'NOT AUTHORIZED'}</Pill>}>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mint text-tealink"><Bot className="h-5 w-5" /></div>
              <div className="text-sm">
                <div>Agent <Addr value={net?.agent ?? null} /> acts for <Addr value={net?.business ?? null} /></div>
                <div className="mt-1 text-muted">Mandate: up to USD 5,000 per payment, 250,000 a day. Only counterparties with a Pass.</div>
              </div>
            </div>
          </Card>

          <Card title="Ask the agent" action={chat && <span className="font-mono text-[11px] text-muted">{chat.model}</span>}>
            <form onSubmit={(e) => { e.preventDefault(); if (!thinking) ask(); }} className="flex gap-2">
              <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm" />
              <button disabled={thinking} className="rounded-xl bg-teal px-4 py-2 text-sm font-bold text-onteal disabled:opacity-50">{thinking ? 'Working…' : 'Send'}</button>
            </form>
            {thinking && <div className="mt-3 animate-pulse text-sm text-muted">The agent is checking its identity, reading the bills and running Flow Check on each payment…</div>}
            {chatError && <div className="mt-3 text-sm text-danger">{chatError}</div>}
            {chat && (
              <div className="mt-4 space-y-3">
                <ol className="space-y-1.5">
                  {chat.steps.map((s, i) => {
                    const o = s.output as { status?: string; decision?: string; authorized?: boolean; engineResult?: string };
                    const result = o?.status ?? o?.decision ?? (o?.authorized !== undefined ? (o.authorized ? 'AUTHORIZED' : 'NOT AUTHORIZED') : null);
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-1.5 text-[13px]">
                        <span className="font-mono">{s.tool}{(s.input as { amount?: number })?.amount ? ` · ${(s.input as { amount: number }).amount}` : ''}</span>
                        {result && <Pill tone={/PAID|ALLOW|^AUTHORIZED/.test(result) ? 'ok' : /PENDING|NEEDS/.test(result) ? 'warn' : 'no'}>{result}</Pill>}
                      </li>
                    );
                  })}
                </ol>
                <div className="whitespace-pre-wrap rounded-xl border border-line px-4 py-3 text-sm leading-relaxed">{chat.reply}</div>
              </div>
            )}
          </Card>

          <Card title="This month's bills" action={<span className="text-xs text-muted">demo invoices · real testnet payments</span>}>
            <ul className="divide-y divide-line">
              {BILLS.map((b) => {
                const r = results[b.scene];
                const failed = r?.checks?.filter((c) => !c.ok) ?? [];
                return (
                  <li key={b.scene} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{b.vendor}</div>
                        <div className="text-[13px] text-muted">{b.note} · {net && <Addr value={b.to(net)} />}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="num font-semibold">{b.amount.toLocaleString('en-US')} RLUSD</span>
                        {r?.status ? <Pill tone={tone(r.status)}>{label(r.status)}</Pill> : (
                          <button onClick={() => run(b.scene)} disabled={!!busy} className="rounded-full bg-teal px-3.5 py-1.5 text-sm font-bold text-onteal disabled:opacity-50">
                            {busy === b.scene ? 'Checking…' : 'Let the agent pay'}
                          </button>
                        )}
                      </div>
                    </div>
                    {r?.error && <div className="mt-2 text-sm text-danger">{r.error}</div>}
                    {r?.explorer && <a href={r.explorer} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-semibold text-tealink hover:underline">{r.engineResult} · view on the ledger ↗</a>}
                    {failed.length > 0 && <div className="mt-2 rounded-xl bg-sunken px-3"><Checks checks={failed} /></div>}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Approvals" action={pending && <Pill tone="warn">1 pending</Pill>}>
            {pending ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm"><span className="font-semibold">Design studio · 6,000 RLUSD.</span> <span className="text-muted">Over the per-payment limit. The CFO signs as the business.</span></div>
                <button onClick={() => run('2-approve')} disabled={!!busy} className="rounded-full bg-ink px-3.5 py-1.5 text-sm font-bold text-paper disabled:opacity-50">
                  {busy === '2-approve' ? 'Signing…' : 'Approve and sign'}
                </button>
              </div>
            ) : <div className="text-sm text-muted">Nothing waiting for approval.</div>}
            <div className="mt-3 text-xs text-muted">In the live demo the CFO signs on a Ledger device. Here the business key signs on the server.</div>
          </Card>

          <Card title="Try to bypass Flow Check">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3 text-sm">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div><span className="font-semibold">An agent without KYA pays a verified supplier directly.</span> <span className="text-muted">No Flow Check in the way: only the ledger.</span></div>
              </div>
              {results['3b'] ? <Pill tone="no">{results['3b'].engineResult}</Pill> : (
                <button onClick={() => run('3b')} disabled={!!busy} className="rounded-full border border-danger px-3.5 py-1.5 text-sm font-bold text-danger disabled:opacity-50">{busy === '3b' ? 'Sending…' : 'Send it'}</button>
              )}
            </div>
            {results['3b']?.explorer && <a href={results['3b'].explorer} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-semibold text-tealink hover:underline">Refused by the validators · view on the ledger ↗</a>}
          </Card>
        </div>

        <div className="space-y-6">
          {kya && <Card title="Know your agent"><Checks checks={kya.checks} /></Card>}
          <Activity />
        </div>
      </div>
    </div>
  );
}
