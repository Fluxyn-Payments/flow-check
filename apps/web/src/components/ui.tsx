import type { ReactNode } from 'react';
import { Check as CheckIcon, X, AlertTriangle, ExternalLink } from 'lucide-react';
import type { Check } from '../api';
import { explorerAccount } from '../api';

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-lift ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'ok' | 'warn' | 'no' | 'teal' | 'neutral';
const TONES: Record<Tone, string> = {
  ok: 'bg-leaf/15 text-leaf',
  warn: 'bg-sunsoft text-sun',
  no: 'bg-dangersoft text-danger',
  teal: 'bg-mint text-tealink',
  neutral: 'bg-sunken text-muted',
};

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

export const short = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export function Addr({ value, label }: { value: string | null; label?: string }) {
  if (!value) return <span className="text-muted">—</span>;
  return (
    <a href={explorerAccount(value)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-mono text-[12.5px] text-tealink hover:underline" title={value}>
      {label ?? short(value)}
      <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}

export function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-line">
      {checks.map((c) => {
        const tone = c.ok ? 'text-leaf' : c.effect === 'DENY' ? 'text-danger' : 'text-sun';
        const Icon = c.ok ? CheckIcon : c.effect === 'DENY' ? X : AlertTriangle;
        return (
          <li key={c.id} className="flex gap-3 py-2.5">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} strokeWidth={2.5} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{c.label}</div>
              <div className="break-words text-[13px] text-muted">{c.detail}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-lift">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="num mt-2 font-display text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
    </div>
  );
}

export function Loading({ what = 'Reading the ledger' }: { what?: string }) {
  return <div className="animate-pulse text-sm text-muted">{what}…</div>;
}
