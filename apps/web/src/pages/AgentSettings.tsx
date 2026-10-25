import { useEffect, useState, type ChangeEvent } from 'react';
import { Building2 as Building2Icon, FileText as FileTextIcon, NotebookPen as NotebookPenIcon } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '../api';
import { Card, Loading, Pill } from '../components/ui';

type Supplier = { name: string; account?: string; category?: string; notes?: string };
type Doc = { title: string; text: string };
type Knowledge = { instructions: string; suppliers: Supplier[]; documents: Doc[]; updatedAt: string | null };

const NAMES: Record<string, string> = { payables: 'Payables agent', marketing: 'Marketing agent' };
const input = 'w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30';

// Simple CSV: name,account,category,notes (header optional)
function parseCsv(text: string): Supplier[] {
  const rows = text.split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim())).filter((r) => r[0]);
  const body = /name/i.test(rows[0]?.[0] ?? '') ? rows.slice(1) : rows;
  return body.map(([name, account, category, ...notes]) => ({ name, account: account || undefined, category: category || undefined, notes: notes.join(',') || undefined }));
}

// The CFO teaches an agent: instructions, known suppliers and reference documents. Flow Check still decides every payment.
export function AgentSettings() {
  const { agentKey = 'payables' } = useParams();
  const [k, setK] = useState<Knowledge | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setK(null); api<Knowledge>(`/api/agents/${agentKey}/knowledge`).then(setK).catch((e) => setMsg(e.message)); }, [agentKey]);

  const save = async () => {
    if (!k) return;
    setSaving(true); setMsg(null);
    try {
      const saved = await api<Knowledge>(`/api/agents/${agentKey}/knowledge`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(k) });
      setK(saved); setMsg('Saved. The agent uses it from its next message.');
    } catch (e) { setMsg((e as Error).message); } finally { setSaving(false); }
  };

  const readFile = (e: ChangeEvent<HTMLInputElement>, onText: (name: string, text: string) => void) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200_000) { setMsg('Files up to 200 KB.'); return; }
    f.text().then((t) => onText(f.name, t));
    e.target.value = '';
  };

  const setSup = (i: number, patch: Partial<Supplier>) => k && setK({ ...k, suppliers: k.suppliers.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-6">
      <Link to="/agents" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Agents and budgets</Link>
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-tealink">Train your agent</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{NAMES[agentKey] ?? agentKey}</h1>
          <p className="mt-2 max-w-2xl text-muted">What the agent knows. Flow Check still decides every payment.</p>
        </div>
        <button onClick={save} disabled={!k || saving} className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-[15px] font-semibold text-onteal transition hover:brightness-95 disabled:opacity-55">{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {msg && <div className="rounded-xl bg-sunken px-4 py-2.5 text-sm">{msg}</div>}
      {!k && !msg && <Loading what="Loading what the agent knows" />}

      {k && (
        <>
          <Card title="Instructions" icon={NotebookPenIcon} action={k.updatedAt && <span className="text-xs text-muted">updated {k.updatedAt.slice(0, 16).replace('T', ' ')}</span>}>
            <textarea value={k.instructions} onChange={(e) => setK({ ...k, instructions: e.target.value })} rows={5} maxLength={4000} className={input}
              placeholder="How should this agent work? For example: pay the cloud bill on the 5th, never split invoices, tell the team how much budget is left." />
            <p className="mt-2 text-xs text-muted">Written in plain language. The agent follows it inside its Mandate.</p>
          </Card>

          <Card title="Known suppliers" icon={Building2Icon} action={
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-sunken">
                <Upload className="h-3.5 w-3.5" />Import CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => readFile(e, (_, t) => setK({ ...k, suppliers: [...k.suppliers, ...parseCsv(t)] }))} />
              </label>
              <button onClick={() => setK({ ...k, suppliers: [...k.suppliers, { name: '' }] })} className="inline-flex items-center gap-1 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-tealink"><Plus className="h-3.5 w-3.5" />Add</button>
            </div>}>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted">
                  <tr className="border-b border-line"><th className="px-5 py-2">Name</th><th className="px-2 py-2">XRPL account</th><th className="px-2 py-2">Category</th><th className="px-2 py-2">Notes</th><th className="px-5 py-2" /></tr>
                </thead>
                <tbody>
                  {k.suppliers.map((s, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-5 py-2"><input value={s.name} onChange={(e) => setSup(i, { name: e.target.value })} className={input} /></td>
                      <td className="px-2 py-2"><input value={s.account ?? ''} onChange={(e) => setSup(i, { account: e.target.value })} className={`${input} font-mono`} placeholder="r…" /></td>
                      <td className="px-2 py-2"><input value={s.category ?? ''} onChange={(e) => setSup(i, { category: e.target.value })} className={input} placeholder="design" /></td>
                      <td className="px-2 py-2"><input value={s.notes ?? ''} onChange={(e) => setSup(i, { notes: e.target.value })} className={input} /></td>
                      <td className="px-5 py-2 text-right"><button onClick={() => setK({ ...k, suppliers: k.suppliers.filter((_, j) => j !== i) })} className="text-muted hover:text-danger" aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">CSV columns: name, account, category, notes. A supplier still needs a Pass to be paid.</p>
          </Card>

          <Card title="Reference documents" icon={FileTextIcon} action={
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-sunken">
              <Upload className="h-3.5 w-3.5" />Upload .txt, .md or .csv
              <input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" className="hidden" onChange={(e) => readFile(e, (name, t) => setK({ ...k, documents: [...k.documents, { title: name, text: t }] }))} />
            </label>}>
            {k.documents.length === 0 && <p className="text-sm text-muted">No documents yet. Payment policies, supplier terms or an ERP export work well.</p>}
            <ul className="divide-y divide-line">
              {k.documents.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted" /><span className="truncate font-semibold">{d.title}</span><Pill tone="neutral">{d.text.length.toLocaleString('en-US')} chars</Pill></span>
                  <button onClick={() => setK({ ...k, documents: k.documents.filter((_, j) => j !== i) })} className="text-muted hover:text-danger" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
