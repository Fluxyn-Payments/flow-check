import { Link } from 'react-router-dom';
import { ChevronRight, Code2, FileSpreadsheet, Plug, Puzzle, Webhook } from 'lucide-react';
import { Card } from '../components/ui';

const Status = ({ live }: { live: boolean }) => <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${live ? 'bg-leaf/15 text-leaf' : 'bg-sunken text-muted'}`}>{live ? 'Live' : 'Planned'}</span>;

function Item({ icon: Icon, title, detail, live, children }: { icon: typeof Plug; title: string; detail: string; live: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-tealink"><Icon className="h-5 w-5" /></span>
        <Status live={live} />
      </div>
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-muted">{detail}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

const linkCls = 'inline-flex items-center gap-1 text-sm font-semibold text-tealink hover:underline';

// How the business plugs its agents into the tools it already uses
export function Integrations() {
  return (
    <div className="space-y-8">
      <div className="rise">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-[44px]">Integrations</h1>
        <p className="mt-2 text-lg text-muted">Bring bills in from your ERP and let your agents work where your team already is. Every channel uses the agent's key, and the Mandate applies everywhere.</p>
      </div>

      <Card title="ERP and accounts payable" icon={FileSpreadsheet}>
        <div className="grid gap-4 md:grid-cols-3">
          <Item icon={FileSpreadsheet} title="CSV import" detail="Suppliers and reference documents (an ERP export works) for each agent." live>
            <Link to="/agents/payables/train" className={linkCls}>Import in Train agent <ChevronRight className="h-4 w-4" /></Link>
          </Item>
          <Item icon={Code2} title="REST API" detail="Your ERP asks the agent to pay or check bills: POST /api/v1/agent/run with the agent key as a Bearer token." live>
            <a href="/api/docs" target="_blank" rel="noopener" className={linkCls}>OpenAPI docs <ChevronRight className="h-4 w-4" /></a>
          </Item>
          <Item icon={Webhook} title="Native connectors" detail="Two-way sync of vendors, bills and payments with the main cloud ERPs and accounting suites." live={false} />
        </div>
      </Card>

      <Card title="Where your agents live" icon={Plug}>
        <div className="grid gap-4 md:grid-cols-3">
          <Item icon={Plug} title="MCP" detail="Each agent as an MCP server for Claude or ChatGPT. Issue or revoke its key per agent." live>
            <Link to="/agents/payables/manage" className={linkCls}>Manage keys <ChevronRight className="h-4 w-4" /></Link>
          </Item>
          <Item icon={Puzzle} title="Chat widget" detail="One script tag puts the agent inside your bank's or ERP's web app." live>
            <a href="/embed-demo.html" target="_blank" rel="noopener" className={linkCls}>See it embedded <ChevronRight className="h-4 w-4" /></a>
          </Item>
          <Item icon={Code2} title="Postman collection" detail="Every endpoint, ready to try." live>
            <a href="/api/postman.json" className={linkCls}>Download <ChevronRight className="h-4 w-4" /></a>
          </Item>
        </div>
        <pre className="mt-5 overflow-x-auto rounded-xl bg-sunken p-4 font-mono text-xs">{`curl -X POST https://flowcheck.fluxyn.com/api/v1/agent/run \\
  -H "Authorization: Bearer fca_…" -H "content-type: application/json" \\
  -d '{"message":"Pay this month\\'s bills"}'`}</pre>
      </Card>
    </div>
  );
}
