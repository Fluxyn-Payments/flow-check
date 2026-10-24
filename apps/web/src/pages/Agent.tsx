import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApi, type AgentResult } from '../api';
import { Activity } from '../components/Activity';
import { Addr, Card, Checks, Loading, Pill } from '../components/ui';

export function Agent() {
  const { address = '' } = useParams();
  const { data, error } = useApi<AgentResult>(`/api/agent/${address}`);

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Network</Link>
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Know your agent</h1>
          <div className="mt-2 text-muted">Agent <Addr value={address} label={address} /></div>
        </div>
        {data && <Pill tone={data.authorized ? 'ok' : 'no'}>{data.authorized ? 'AUTHORIZED' : 'NOT AUTHORIZED'}</Pill>}
      </div>

      {error && <Card><span className="text-danger">{error}</span></Card>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card title="Flow Check">
          {!data && <Loading />}
          {data && (
            <>
              <div className="mb-3 grid gap-1 text-sm">
                <div><span className="text-muted">Acts for</span> <Addr value={data.principal} /></div>
                <div><span className="text-muted">Attested by</span> <Addr value={data.issuer} /></div>
              </div>
              <Checks checks={data.checks} />
            </>
          )}
        </Card>
        {data?.principal ? <Activity account={data.principal} title="Payments of this business" /> : <Card title="Payments"><div className="text-sm text-muted">No business linked to this agent.</div></Card>}
      </div>
    </div>
  );
}
