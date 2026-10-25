import { useState, type FormEvent } from 'react';
import { Mail, Trash2, UserPlus, Users } from 'lucide-react';
import { api, useApi } from '../api';
import { Card, Loading } from '../components/ui';
import { AGENT_META } from './Agents';

type TeamUser = { email: string; name: string; role: string; agents: ('payables' | 'marketing')[]; status: 'active' | 'invited' };
const field = 'h-11 w-full rounded-xl border border-line bg-paper px-3 text-[15px] focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30';

// Who operates which agent. The CFO is the business admin; operators see only their own agent.
export function Team() {
  const { data: users, reload } = useApi<TeamUser[]>('/api/business/team');
  const [form, setForm] = useState({ email: '', name: '', role: 'Agent operator', agents: ['payables'] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api('/api/business/team', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      setForm({ ...form, email: '', name: '' }); reload();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const remove = async (email: string) => { await api(`/api/business/team/${encodeURIComponent(email)}`, { method: 'DELETE' }); reload(); };
  const toggleAgent = (k: string) => setForm({ ...form, agents: form.agents.includes(k) ? form.agents.filter((x) => x !== k) : [...form.agents, k] });

  return (
    <div className="space-y-8">
      <div className="rise">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-[44px]">Team</h1>
        <p className="mt-2 text-lg text-muted">Who operates each agent. Operators chat with their agent and see its budget; only the CFO changes Mandates and approves.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Members" icon={Users} action={users && <span className="text-sm text-muted">{users.length}</span>}>
          {!users ? <Loading /> : (
            <ul className="divide-y divide-line">
              {users.map((u) => (
                <li key={u.email} className="flex flex-wrap items-center gap-4 py-3.5">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-mint font-bold uppercase text-tealink">{u.name.slice(0, 2)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{u.name} <span className="ml-1 text-sm font-normal text-muted">{u.role}</span></span>
                    <span className="block text-sm text-muted">{u.email}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">{u.agents.map((k) => <span key={k} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold">{AGENT_META[k].name}</span>)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${u.status === 'active' ? 'bg-leaf/15 text-leaf' : 'bg-sunsoft text-sun'}`}>{u.status}</span>
                  {u.status === 'invited' && <button onClick={() => remove(u.email)} className="text-muted hover:text-danger" aria-label="Remove invitation"><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Invite a member" icon={UserPlus}>
          <form onSubmit={submit} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold">Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ana@lumenrobotics.example" className={field} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={field}><option>Agent operator</option><option>Viewer</option></select>
            </label>
            <fieldset className="grid gap-2 text-sm"><legend className="mb-1.5 font-semibold">Agents</legend>
              {(['payables', 'marketing'] as const).map((k) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form.agents.includes(k)} onChange={() => toggleAgent(k)} className="h-4 w-4 accent-[rgb(20_201_192)]" />{AGENT_META[k].name}</label>
              ))}
            </fieldset>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button disabled={busy || !form.email} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-teal font-semibold text-onteal disabled:opacity-50"><Mail className="h-4 w-4" />Send invitation</button>
            <p className="text-xs text-muted">Demo: the invitation is recorded, no email is sent.</p>
          </form>
        </Card>
      </div>
    </div>
  );
}
