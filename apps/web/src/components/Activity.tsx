import { ExternalLink } from 'lucide-react';
import { Activity as ActivityIcon } from 'lucide-react';
import { useApi, type LedgerEvent } from '../api';
import { Card, Loading, Pill } from './ui';

// Live transactions for one account (or the demo accounts when omitted), refreshed every 5 s
export function Activity({ account, title = 'Live on the ledger' }: { account?: string; title?: string }) {
  const { data } = useApi<LedgerEvent[]>(account ? `/api/activity/${account}` : '/api/events', 5000);
  return (
    <Card title={title} icon={ActivityIcon} action={<span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-leaf" />live</span>}>
      {!data && <Loading />}
      {data && data.length === 0 && <div className="text-sm text-muted">No transactions yet.</div>}
      <ul className="divide-y divide-line">
        {data?.slice(0, 20).map((e) => (
          <li key={e.hash} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm"><span className="font-semibold">{e.type}</span> {e.amount && <span className="num">{e.amount}</span>}</div>
              <div className="truncate text-[13px] text-muted">
                {e.from}{e.via && <> <span className="text-tealink">via {e.via}</span></>}{e.to && <> → {e.to}</>}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Pill tone={e.result === 'tesSUCCESS' ? 'ok' : 'no'}>{e.result}</Pill>
              <a href={e.explorer} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-tealink hover:underline">explorer <ExternalLink className="h-3 w-3" /></a>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
