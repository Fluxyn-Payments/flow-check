import { useState } from 'react';
import { Bot, Building2, ShieldCheck, ShieldOff } from 'lucide-react';
import { api, useApi, type AgentResult } from '../api';
import { Addr, Card, Checks, Loading, Pill } from '../components/ui';
import { getSession } from '../session';

type Issued = { subject: string; type: string; accepted: boolean; expires: string | null; binding: { principal: string | null; evm: string | null } | null };
type View = { issuer: { address: string; name: string; type: string }; demoAgent: string; demoBusiness: string; issued: Issued[] };
type TxResult = { engineResult: string; hash: string | null; explorer: string | null; error?: string };

// What a VASP sees: the businesses it verified, the agents it attested, and the power to revoke
export function Issuer() {
  const { data, reload } = useApi<View>('/api/issuer');
  const { data: kya, reload: reloadKya } = useApi<AgentResult>(data ? `/api/agent/${data.demoAgent}` : null);
  const [busy, setBusy] = useState<'revoke' | 'attest' | null>(null);
  const [result, setResult] = useState<{ action: string; r: TxResult } | null>(null);
  const isIssuer = getSession()?.role === 'issuer';

  const act = async (action: 'revoke' | 'attest') => {
    setBusy(action); setResult(null);
    try {
      const r = await api<TxResult>(`/api/issuer/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: data?.demoAgent }) });
      setResult({ action, r });
    } catch (e) {
      setResult({ action, r: { engineResult: 'error', hash: null, explorer: null, error: (e as Error).message } });
    } finally {
      setBusy(null); reload(); reloadKya();
    }
  };

  const businesses = data?.issued.filter((c) => c.type.startsWith('KYB_')) ?? [];
  const agents = data?.issued.filter((c) => c.type === 'AGENT_AUTHORIZED') ?? [];
  const attested = agents.some((a) => a.subject === data?.demoAgent);

  return (
    <div className="space-y-6">
      <div className="rise">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-tealink">Issuer console</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{data?.issuer.name ?? 'Issuer'}</h1>
        <p className="mt-2 max-w-2xl text-muted">Verify businesses, attest their agents, revoke in one click.</p>
      </div>

      {!data && <Loading />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card title="Demo agent" action={kya && <Pill tone={kya.authorized ? 'ok' : 'no'}>{kya.authorized ? 'KYA · AUTHORIZED' : 'NOT AUTHORIZED'}</Pill>}>
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mint text-tealink"><Bot className="h-5 w-5" /></div>
              <div className="text-sm">
                <div className="font-semibold">Payables agent</div>
                <div className="text-muted">Agent <Addr value={data.demoAgent} /> · acts for <Addr value={data.demoBusiness} /></div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button onClick={() => act('revoke')} disabled={!isIssuer || !!busy || !attested}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-45">
                <ShieldOff className="h-4 w-4" />{busy === 'revoke' ? 'Revoking on the ledger…' : 'Revoke attestation'}
              </button>
              <button onClick={() => act('attest')} disabled={!isIssuer || !!busy || attested}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-teal px-4 text-sm font-semibold text-onteal transition hover:brightness-95 disabled:opacity-45">
                <ShieldCheck className="h-4 w-4" />{busy === 'attest' ? 'Attesting on the ledger…' : 'Attest agent'}
              </button>
            </div>
            {!isIssuer && <p className="mt-2 text-xs text-muted">Only the issuer can revoke or attest.</p>}
            {result && (
              <div className="mt-3 rounded-xl bg-sunken px-3.5 py-2.5 text-sm">
                {result.r.error ? <span className="text-danger">{result.r.error}</span> : (
                  <>
                    <Pill tone={result.r.engineResult === 'tesSUCCESS' ? 'ok' : 'warn'}>{result.r.engineResult}</Pill>{' '}
                    {result.action === 'revoke' ? 'Attestation revoked: Flow Check no longer authorizes this agent.' : 'Agent attested again.'}{' '}
                    {result.r.explorer && <a href={result.r.explorer} target="_blank" rel="noopener" className="font-semibold text-tealink hover:underline">View on the ledger ↗</a>}
                  </>
                )}
              </div>
            )}
            {kya && <div className="mt-4"><Checks checks={kya.checks} /></div>}
          </Card>

          <div className="space-y-6">
            <Card title="Businesses verified" action={<span className="text-xs text-muted">{businesses.length}</span>}>
              <ul className="divide-y divide-line">
                {businesses.map((b) => (
                  <li key={b.subject} className="flex items-center justify-between gap-3 py-3">
                    <span className="flex items-center gap-2.5"><Building2 className="h-4 w-4 text-muted" /><Addr value={b.subject} /></span>
                    <Pill tone={b.type === 'KYB_VERIFIED' ? 'ok' : 'teal'}>{b.type === 'KYB_VERIFIED' ? 'Pass Full' : 'Pass Basic'}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Agents attested" action={<span className="text-xs text-muted">{agents.length}</span>}>
              {agents.length === 0 && <div className="text-sm text-muted">No agent attested right now.</div>}
              <ul className="divide-y divide-line">
                {agents.map((a) => (
                  <li key={a.subject} className="py-3 text-sm">
                    <div className="flex items-center justify-between gap-3"><Addr value={a.subject} /><Pill tone="ok">AGENT_AUTHORIZED</Pill></div>
                    <div className="mt-1 text-[13px] text-muted">for <Addr value={a.binding?.principal ?? null} />{a.binding?.evm && <> · EVM <span className="font-mono">{a.binding.evm.slice(0, 6)}…{a.binding.evm.slice(-4)}</span></>}{a.expires && <> · expires {a.expires.slice(0, 10)}</>}</div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
