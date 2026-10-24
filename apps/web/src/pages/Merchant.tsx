import { Card, Pill } from '../components/ui';

const STEPS = [
  { n: '1', title: 'The agent asks for a resource', body: 'A metered service, for example a verification or a data API.' },
  { n: '2', title: 'HTTP 402', body: 'The merchant answers with the payment requirements.' },
  { n: '3', title: 'Signed voucher', body: 'The agent signs an EIP-712 voucher inside its funded channel. Above the cap, the contract refuses.' },
  { n: '4', title: 'Settlement in RLUSD', body: 'The merchant redeems and settles on XRPL EVM: VoucherRedeemed, ClaimPaid, SettlementRecorded.' },
];

// Merchant view for Mastercard Agent Pay for Machines. No data until our AP4M access is enabled.
export function Merchant() {
  return (
    <div className="space-y-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Merchant</h1>
          <p className="mt-2 max-w-2xl text-muted">A merchant paid by AI agents through Mastercard Agent Pay for Machines sees every voucher, every settlement, and who stands behind each agent: the business and the PSP or VASP that attested it.</p>
        </div>
        <Pill tone="warn">awaiting AP4M access</Pill>
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

      <Card title="Vouchers and settlements">
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          Live vouchers and settlements will appear here once Mastercard enables our AP4M access. Nothing on this page is simulated.
        </div>
      </Card>
    </div>
  );
}
