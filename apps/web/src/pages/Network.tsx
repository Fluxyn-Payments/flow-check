import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useApi, type Directory, type AgentEntry } from '../api';
import { Addr, Card, Loading, Pill, Stat, short } from '../components/ui';

const STATUS: Record<AgentEntry['status'], { tone: 'ok' | 'warn' | 'no'; label: string; hint: string }> = {
  ATTESTED: { tone: 'ok', label: 'KYA', hint: 'Attested by its issuer, delegated and bound by a Mandate' },
  DELEGATED_ONLY: { tone: 'warn', label: 'NO KYA', hint: 'Can pay for the business, but no issuer vouches for the agent itself' },
  INCOMPLETE: { tone: 'no', label: 'INCOMPLETE', hint: 'Delegated without a Mandate, or attested without delegation' },
};

export function Network() {
  const { data, error } = useApi<Directory>('/api/directory', 15000);
  const issuerName = (a: string | null) => data?.issuers.find((i) => i.address === a)?.name ?? short(a);
  const profile = (a: string | null) => (a ? data?.profiles?.[a] : undefined);

  return (
    <div className="space-y-6">
      <div className="rise">
        <h1 className="text-3xl font-bold sm:text-4xl">The network, read from the ledger</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Licensed PSPs and VASPs issue a Pass to the businesses they verified and attest their AI agents. Nothing on this page comes from a database: issuers, businesses and agents are discovered on XRPL.
        </p>
      </div>

      {error && <Card><span className="text-danger">{error}</span></Card>}
      {!data && !error && <Loading />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Issuers" value={data.counts.issuers} hint="PSPs and VASPs" />
            <Stat label="Businesses" value={data.counts.businesses} hint="holding a Pass" />
            <Stat label="Agents" value={data.counts.agents} hint="acting for a business" />
            <Stat label="With KYA" value={data.counts.attested} hint="attested by their issuer" />
          </div>

          <Card title="Agents">
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2 font-semibold">Agent</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Acts for</th>
                    <th className="px-3 py-2 font-semibold">Attested by</th>
                    <th className="px-3 py-2 font-semibold">Delegation</th>
                    <th className="px-3 py-2 font-semibold">Mandate</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.agents.map((a) => {
                    const s = STATUS[a.status];
                    return (
                      <tr key={a.address} className="hover:bg-sunken/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{profile(a.address)?.name ?? 'Unnamed agent'}</span>
                            {profile(a.address)?.tag && <Pill tone="teal">{profile(a.address)!.tag}</Pill>}
                          </div>
                          {profile(a.address)?.description && <div className="mt-0.5 max-w-xs text-[12.5px] leading-snug text-muted">{profile(a.address)!.description}</div>}
                          <div className="mt-0.5"><Addr value={a.address} /></div>
                        </td>
                        <td className="px-3 py-3"><span title={s.hint}><Pill tone={s.tone}>{s.label}</Pill></span></td>
                        <td className="px-3 py-3">
                          <div className="font-semibold">{profile(a.principal)?.name ?? '—'}</div>
                          <Addr value={a.principal} />
                        </td>
                        <td className="px-3 py-3">{a.issuer ? issuerName(a.issuer) : <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-3">{a.delegated ? <Pill tone="ok">Payment</Pill> : <Pill tone="no">none</Pill>}</td>
                        <td className="px-3 py-3">{a.mandate ? <Pill tone="ok">anchored</Pill> : <Pill tone="no">none</Pill>}</td>
                        <td className="px-5 py-3 text-right">
                          <Link to={`/agents/${a.address}`} className="inline-flex items-center gap-1 text-sm font-semibold text-tealink hover:underline">
                            Details <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
              {Object.values(STATUS).map((s) => (
                <span key={s.label} className="inline-flex items-center gap-2"><Pill tone={s.tone}>{s.label}</Pill>{s.hint}</span>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Issuers">
              <ul className="divide-y divide-line">
                {data.issuers.map((i) => (
                  <li key={i.address} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{i.name}</div>
                      <div className="text-[13px] text-muted">{i.type} · {i.country} · <Addr value={i.address} /></div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Pill tone={i.source === 'nyc' ? 'teal' : 'neutral'}>{i.source === 'nyc' ? 'built in NYC' : 'prior work'}</Pill>
                      <span className="num text-sm text-muted">{i.issued} issued</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Businesses with a Pass">
              <ul className="divide-y divide-line">
                {data.businesses.map((b) => (
                  <li key={b.address} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{profile(b.address)?.name ?? 'Unnamed business'}</div>
                      <div className="text-[13px] text-muted"><Addr value={b.address} /> · by {issuerName(b.issuer)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Pill tone={b.tier === 'KYB_VERIFIED' ? 'ok' : 'teal'}>{b.tier === 'KYB_VERIFIED' ? 'Pass Full' : 'Pass Basic'}</Pill>
                      <span className="text-sm text-muted">{b.agents.length} agent{b.agents.length === 1 ? '' : 's'}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
