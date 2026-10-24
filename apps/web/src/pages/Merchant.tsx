import { useState } from 'react';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { api, useApi } from '../api';
import { Card, Loading, Pill } from '../components/ui';

type Ap4m = {
  enabled: boolean;
  network?: string;
  team?: { name: string; agent: string; payout: string; merchantId: string };
  budget?: { cap: string; funded: string; status: string };
  channel?: { id: string; cap: string; status: string; lastVoucher: string | null } | null;
  proof?: { voucherRedeemed: string | null; claimPaid: string | null; settlementRecorded: string | null; receipt: boolean };
  channels?: { id: string; status: string; cap: string; payout: string; open: string | null }[];
  contracts?: Record<string, string>;
};

const STEPS = [
  { n: '1', title: 'Flow Check first', body: 'The agent must be attested, delegated and bound to this EVM wallet on the XRP Ledger.' },
  { n: '2', title: 'HTTP 402', body: 'Our Merchant answers with the payment requirements for a Flow Check network report.' },
  { n: '3', title: 'Signed voucher', body: 'The agent signs an EIP-712 voucher inside its funded channel. Above the cap, the contract refuses.' },
  { n: '4', title: 'Settlement in RLUSD', body: 'VoucherRedeemed, ClaimPaid and SettlementRecorded on XRPL EVM. The payout wallet receives RLUSD.' },
];

const short = (s?: string | null) => (s ? `${s.slice(0, 8)}…${s.slice(-6)}` : '—');
const rlusd = (wei?: string | null) => (wei ? `${Number(BigInt(wei.split('.')[0]) / 10n ** 12n) / 1e6} RLUSD` : '—');

function Proof({ label, href }: { label: string; href: string | null | undefined }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="font-mono text-sm">{label}</span>
      {href ? <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-tealink hover:underline">{short(href.split('/').pop())} <ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-sm text-muted">pending</span>}
    </li>
  );
}

// Merchant view for Mastercard Agent Pay for Machines, with live data from the AP4M service
type OverCap = { refused: boolean; cap: string; redeemed: string; attempted: string; reason: string; note: string; contract: string; error?: string };

export function Merchant() {
  const { data, error } = useApi<Ap4m>('/api/ap4m', 20000);
  const [over, setOver] = useState<OverCap | null>(null);
  const [trying, setTrying] = useState(false);
  const tryOverCap = async () => {
    setTrying(true);
    try { setOver(await api<OverCap>('/api/ap4m/over-cap', { method: 'POST' })); } catch (e) { setOver({ error: (e as Error).message } as OverCap); } finally { setTrying(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Merchant</h1>
          <p className="mt-2 max-w-2xl text-muted">Paid by agents over Mastercard AP4M. Every voucher is on-chain.</p>
        </div>
        {data && <Pill tone={data.enabled ? 'ok' : 'warn'}>{data.enabled ? `live · ${data.network}` : 'not connected'}</Pill>}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-line bg-surface p-5 shadow-lift">
            <div className="font-mono text-xs font-semibold text-tealink">{s.n}</div>
            <div className="mt-2 font-semibold">{s.title}</div>
            <div className="mt-1 text-[13px] text-muted">{s.body}</div>
          </div>
        ))}
      </div>

      {error && <Card><span className="text-danger">{error}</span></Card>}
      {!data && !error && <Loading what="Reading AP4M" />}
      {data?.enabled && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="On-chain proof (latest payment)">
            <ul className="divide-y divide-line">
              <Proof label="VoucherRedeemed" href={data.proof?.voucherRedeemed} />
              <Proof label="ClaimPaid" href={data.proof?.claimPaid} />
              <Proof label="SettlementRecorded" href={data.proof?.settlementRecorded} />
            </ul>
            <div className="mt-3 text-xs text-muted">Payout wallet <span className="font-mono">{short(data.team?.payout)}</span> receives the RLUSD.</div>
          </Card>
          <Card title="Budget and channel">
            <div className="grid grid-cols-2 gap-4">
              <div><div className="text-xs font-bold uppercase tracking-wider text-muted">Team budget</div><div className="num mt-1 font-display text-2xl font-bold">{Number(data.budget?.cap ?? 0)} RLUSD</div></div>
              <div><div className="text-xs font-bold uppercase tracking-wider text-muted">Channel cap</div><div className="num mt-1 font-display text-2xl font-bold">{data.channel ? `${Number(data.channel.cap)} RLUSD` : '—'}</div></div>
              <div><div className="text-xs font-bold uppercase tracking-wider text-muted">Paid on this channel</div><div className="num mt-1 font-display text-2xl font-bold">{rlusd(data.channel?.lastVoucher)}</div></div>
              <div><div className="text-xs font-bold uppercase tracking-wider text-muted">Status</div><div className="mt-2">{data.channel ? <Pill tone={data.channel.status === 'open' ? 'ok' : 'neutral'}>{data.channel.status}</Pill> : '—'}</div></div>
            </div>
            <div className="mt-4 text-xs text-muted">Agent wallet <span className="font-mono">{short(data.team?.agent)}</span> · channel <span className="font-mono">{short(data.channel?.id)}</span></div>
          </Card>
          <Card title="Try to spend above the cap" className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3 text-sm">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div><span className="font-semibold">The agent signs a voucher 1 RLUSD above its channel cap.</span> <span className="text-muted">The PaymentLedger contract decides, not our code.</span></div>
              </div>
              <button onClick={tryOverCap} disabled={trying} className="rounded-full border border-danger px-3.5 py-1.5 text-sm font-bold text-danger disabled:opacity-50">{trying ? 'Asking the contract…' : 'Try it'}</button>
            </div>
            {over && !over.error && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-sunken px-4 py-3 text-sm">
                <Pill tone={over.refused ? 'no' : 'warn'}>{over.refused ? 'REFUSED BY THE CONTRACT' : 'NOT REFUSED'}</Pill>
                <span className="num">cap {Number(over.cap)} RLUSD · already paid {Number(over.redeemed)} · attempted {Number(over.attempted)}</span>
                <span className="text-muted">{over.reason}</span>
                <span className="w-full text-xs text-muted">{over.note}</span>
              </div>
            )}
            {over?.error && <div className="mt-3 text-sm text-danger">{over.error}</div>}
          </Card>
        </div>
      )}
    </div>
  );
}
