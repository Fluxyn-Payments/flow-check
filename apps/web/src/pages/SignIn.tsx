import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Check, ChevronRight, Eye, EyeOff, Landmark, Lock, Mail, Megaphone, Network as NetworkIcon, ShieldX, Sparkles, Store } from 'lucide-react';
import { api } from '../api';
import { HOME, ROLE_LABEL, setSession, type Role, type Session } from '../session';

type Account = { email: string; role: Role; name: string; org: string };

const ROLES: { role: Role; icon: typeof Building2; blurb: string; wide?: boolean }[] = [
  { role: 'business', icon: Building2, blurb: 'The CFO: agents, budgets and approvals' },
  { role: 'member', icon: Megaphone, blurb: 'Marketing team: only its own agent and budget' },
  { role: 'issuer', icon: Landmark, blurb: 'A VASP that verifies businesses and attests agents' },
  { role: 'network', icon: NetworkIcon, blurb: 'Fluxyn: every issuer, business and agent' },
  { role: 'merchant', icon: Store, blurb: 'Paid by agents through Mastercard', wide: true },
];

const BILLS = [
  { name: 'Cloud provider', detail: 'Pass Full · paid in RLUSD', amount: '1,200', ok: true },
  { name: 'Design studio', detail: 'Over the limit · the CFO approves', amount: '6,000', ok: true },
  { name: 'Flow Check report', detail: 'Mastercard AP4M · HTTP 402', amount: '1', ok: true },
  { name: 'New vendor', detail: 'No Pass · refused', amount: '300', ok: false },
];

const field = 'h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-3.5 text-[15px] text-ink transition focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40';

export function SignIn() {
  const nav = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState<Role>('business');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <span className="flex items-center gap-2 self-start">
          <img src="/brand/fluxyn-logo-light.png" alt="Fluxyn" className="h-8 w-auto" />
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Flow Check</span>
        </span>

        <div className="mx-auto flex w-full max-w-[540px] flex-1 flex-col justify-center py-10">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-tealink">Sign in</p>
          <h1 className="mt-3 text-[40px] font-bold leading-tight">Welcome back</h1>
          <p className="mt-2 text-muted">Demo accounts are pre-filled. Pick who you are.</p>

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLES.map(({ role: r, icon: Icon, blurb, wide }) => {
              const on = role === r;
              return (
                <button key={r} type="button" onClick={() => pick(r)} aria-pressed={on}
                  className={`relative flex items-center gap-3 rounded-2xl border p-4 text-left transition ${wide ? 'sm:col-span-2' : ''} ${on ? 'border-teal bg-mint/70 shadow-lift' : 'border-line bg-surface hover:border-teal/50 hover:shadow-lift'}`}>
                  <span className={`flex min-w-0 flex-1 ${wide ? 'items-center gap-4' : 'flex-col gap-2'}`}>
                    <Icon className={`h-6 w-6 shrink-0 ${on ? 'text-tealink' : 'text-muted'}`} strokeWidth={1.6} />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold">{ROLE_LABEL[r]}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted">{blurb}</span>
                    </span>
                  </span>
                  <ChevronRight className={`h-4 w-4 shrink-0 ${on ? 'text-tealink' : 'text-muted'}`} />
                  {on && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-tealink text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>}
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="mt-7 grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">Email</span>
              <span className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className={field} />
              </span>
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">Password</span>
              <span className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" className={`${field} pr-12`} />
                <button type="button" onClick={() => setShow((x) => !x)} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </span>
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button disabled={busy || !email} className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-teal px-5 text-[15px] font-semibold text-onteal shadow-lift transition hover:brightness-95 disabled:opacity-55">
              {busy ? 'Signing in…' : <>Sign in as {ROLE_LABEL[role]} <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
        </div>
        <p className="text-xs text-muted">Hackathon demo on XRPL testnet and XRPL EVM testnet. No real funds.</p>
      </main>

      <aside className="relative hidden overflow-hidden bg-[rgb(6_40_40)] px-12 py-16 text-[rgb(226_247_243)] lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full border border-white/5 bg-white/[0.03]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -left-24 h-[520px] w-[520px] rounded-full border border-white/5 bg-white/[0.025]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-16 h-[460px] w-[460px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(20 201 192 / .45), transparent 65%)' }} />

        <div className="relative mt-16 max-w-xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(120_230_210)]">Know your agent · anchored in KYB</p>
          <h2 className="mt-5 text-[44px] font-extrabold leading-[1.06] xl:text-[46px]">Agents can pay.<br />The ledger decides <span className="text-[rgb(25_211_202)]">whom.</span></h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-[rgb(170_214_206)]">Programmable payments for agents, with real-time policy, compliance and auditability on the XRP Ledger.</p>
        </div>

        <div className="relative w-full max-w-md self-end rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 text-sm text-[rgb(170_214_206)]"><Sparkles className="h-4 w-4 text-[rgb(120_230_210)]" />Payables agent</div>
          <p className="mt-3 rounded-xl bg-white/[0.08] px-3.5 py-2.5 font-mono text-sm">› pay this month's bills</p>
          <ul className="mt-4 grid gap-3">
            {BILLS.map((b) => (
              <li key={b.name} className="flex items-center gap-3 text-sm">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${b.ok ? 'bg-[rgb(31_184_118)] text-white' : 'bg-[rgb(200_70_80)] text-white'}`}>
                  {b.ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <ShieldX className="h-4 w-4" />}
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
