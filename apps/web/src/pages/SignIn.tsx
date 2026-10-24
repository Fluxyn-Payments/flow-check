import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, Landmark, Megaphone, Network as NetworkIcon, ShieldX, Sparkles, Store } from 'lucide-react';
import { api } from '../api';
import { HOME, ROLE_LABEL, setSession, type Role, type Session } from '../session';

type Account = { email: string; role: Role; name: string; org: string };

const ROLES: { role: Role; icon: typeof Building2; blurb: string }[] = [
  { role: 'business', icon: Building2, blurb: 'The CFO: agents, budgets and approvals' },
  { role: 'member', icon: Megaphone, blurb: 'Marketing team: only its own agent and budget' },
  { role: 'issuer', icon: Landmark, blurb: 'A VASP that verifies businesses and attests agents' },
  { role: 'network', icon: NetworkIcon, blurb: 'Fluxyn: every issuer, business and agent' },
  { role: 'merchant', icon: Store, blurb: 'Paid by agents through Mastercard' },
];

const BILLS = [
  { name: 'Cloud provider', detail: 'Pass Full · paid in RLUSD', amount: '1,200', ok: true },
  { name: 'Design studio', detail: 'Over the limit · the CFO approves', amount: '6,000', ok: true },
  { name: 'Flow Check report', detail: 'Mastercard AP4M · HTTP 402', amount: '1', ok: true },
  { name: 'New vendor', detail: 'No Pass · refused', amount: '300', ok: false },
];

export function SignIn() {
  const nav = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState<Role>('business');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ accounts: Account[]; password: string }>('/api/demo-accounts').then((d) => {
      setAccounts(d.accounts);
      setPassword(d.password);
      setEmail(d.accounts.find((a) => a.role === 'business')?.email ?? '');
    }).catch(() => setError('Could not reach the server'));
  }, []);

  const pick = (r: Role) => {
    setRole(r);
    setEmail(accounts.find((a) => a.role === r)?.email ?? '');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const s = await api<Session>('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      setSession(s);
      nav(HOME[s.role]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <span className="flex items-center gap-2 self-start">
          <img src="/brand/fluxyn-logo-light.png" alt="Fluxyn" className="h-8 w-auto" />
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Flow Check</span>
        </span>
        <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[34px] font-bold leading-tight">Sign in</h1>
          <p className="mt-2 text-muted">Demo accounts are filled in. Pick who you are.</p>

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {ROLES.map(({ role: r, icon: Icon, blurb }) => (
              <button key={r} type="button" onClick={() => pick(r)}
                className={`rounded-2xl border p-3.5 text-left transition ${role === r ? 'border-teal bg-mint shadow-lift' : 'border-line bg-surface hover:border-teal/50'}`}>
                <Icon className={`h-5 w-5 ${role === r ? 'text-tealink' : 'text-muted'}`} />
                <div className="mt-2 text-sm font-bold">{ROLE_LABEL[r]}</div>
                <div className="mt-0.5 text-xs leading-snug text-muted">{blurb}</div>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
                className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40" />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button disabled={busy || !email} className="mt-1 inline-flex h-11 items-center justify-center rounded-full bg-teal px-5 text-[15px] font-semibold text-onteal transition hover:brightness-95 disabled:opacity-55">
              {busy ? 'Signing in…' : `Sign in as ${ROLE_LABEL[role]}`}
            </button>
          </form>
        </div>
        <p className="text-xs text-muted">Hackathon demo on XRPL testnet and XRPL EVM testnet. No real funds.</p>
      </main>

      <aside className="relative hidden overflow-hidden bg-[rgb(6_40_40)] p-12 text-[rgb(226_247_243)] lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(20 201 192 / .55), transparent 65%)' }} />
        <div className="relative max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[rgb(120_230_210)]">Know your agent · anchored in KYB</p>
          <h2 className="mt-4 text-[44px] font-extrabold leading-[1.02]">Agents can pay. The ledger decides whom.</h2>
        </div>
        <div className="relative w-full max-w-md self-end rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-sm text-[rgb(170_214_206)]"><Sparkles className="h-4 w-4 text-[rgb(120_230_210)]" />Payables agent</div>
          <p className="mt-3 rounded-xl bg-white/[0.08] px-3.5 py-2.5 font-mono text-sm">› pay this month's bills</p>
          <ul className="mt-4 grid gap-2.5">
            {BILLS.map((b) => (
              <li key={b.name} className="flex items-center gap-3 text-sm">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${b.ok ? 'bg-[rgb(31_184_118/.22)] text-[rgb(120_235_180)]' : 'bg-[rgb(255_120_120/.18)] text-[rgb(255_150_150)]'}`}>
                  {b.ok ? <Check className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{b.name}</span>
                  <span className="block truncate text-xs text-[rgb(150_190_184)]">{b.detail}</span>
                </span>
                <span className="num font-mono text-xs">{b.amount} RLUSD</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
