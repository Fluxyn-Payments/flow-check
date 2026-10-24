import { useEffect, useState } from 'react';
import { Check, Copy, Plug } from 'lucide-react';
import { api } from '../api';
import { Pill } from './ui';

// The agent's own MCP server: the CFO issues a key, the team connects it to Claude or ChatGPT, and can revoke it
export function AgentMcp({ agent }: { agent: 'payables' | 'marketing' }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { api<{ active: boolean }>(`/api/agents/${agent}/mcp-key`).then((r) => setActive(r.active)).catch(() => setActive(null)); }, [agent]);

  const call = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    try {
      const r = await api<{ url?: string }>(`/api/agents/${agent}/mcp-key`, { method });
      setUrl(r.url ?? null); setActive(!!r.url);
    } finally { setBusy(false); }
  };
  const copy = (label: string, text: string) => { void navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500); };
  const desktop = url && JSON.stringify({ mcpServers: { [`flow-check-${agent}`]: { command: 'npx', args: ['-y', 'mcp-remote', url] } } }, null, 2);

  return (
    <div className="mt-5 rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><Plug className="h-4 w-4 text-tealink" />Agent MCP {active ? <Pill tone="ok">connected</Pill> : active === false && <Pill tone="neutral">no key</Pill>}</span>
        <span className="flex gap-2">
          <button onClick={() => call('POST')} disabled={busy} className="rounded-full bg-teal px-3 py-1 text-xs font-semibold text-onteal disabled:opacity-50">{active ? 'New key' : 'Connect to Claude'}</button>
          {active && <button onClick={() => call('DELETE')} disabled={busy} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:text-danger disabled:opacity-50">Revoke</button>}
        </span>
      </div>
      {url && desktop && (
        <div className="mt-3 space-y-3 text-xs">
          <p className="text-muted">Shown once. Anyone with this URL acts as this agent, always inside its Mandate. A new key revokes the previous one.</p>
          <Snippet label="URL · claude.ai or ChatGPT connector" text={url} copied={copied} onCopy={copy} />
          <Snippet label="Claude Desktop · claude_desktop_config.json" text={desktop} copied={copied} onCopy={copy} />
        </div>
      )}
    </div>
  );
}

function Snippet({ label, text, copied, onCopy }: { label: string; text: string; copied: string | null; onCopy: (l: string, t: string) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-semibold">{label}
        <button onClick={() => onCopy(label, text)} className="inline-flex items-center gap-1 text-tealink">{copied === label ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === label ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-sunken p-2.5 font-mono text-[11px]">{text}</pre>
    </div>
  );
}
