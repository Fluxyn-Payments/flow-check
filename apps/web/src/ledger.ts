import { api } from './api';

// The CFO signs over-limit payments on a Ledger device (XRP app, WebHID in Chrome).
// The server prepares the payments and submits them; the key never leaves the device.
const PATH = "44'/144'/0'/0/0";
type Prepared = { ledgerAddress: string; regularKey: { explorer: string } | null; txs: { bill: string; vendor: string; amount: number; tx: unknown; blob: string }[] };
export type LedgerResult = { bill: string; status: string; engineResult?: string; explorer?: string; error?: string };

export const ledgerSupported = () => typeof navigator !== 'undefined' && 'hid' in navigator;

export async function approveOnLedger(agent: string | undefined, bills: string[], onStep: (s: string) => void): Promise<LedgerResult[]> {
  const { Buffer } = await import('buffer');
  (globalThis as any).Buffer ??= Buffer;
  const [{ default: TransportWebHID }, { default: Xrp }] = await Promise.all([import('@ledgerhq/hw-transport-webhid'), import('@ledgerhq/hw-app-xrp')]);
  onStep('Connect the Ledger and open the XRP app');
  const transport = await TransportWebHID.create();
  try {
    const xrp = new Xrp(transport);
    const { publicKey } = await xrp.getAddress(PATH);
    onStep('Preparing the payments');
    const prep = await api<Prepared>('/api/business/ledger/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent, bills, publicKey }) });
    const signed = [];
    for (const [i, t] of prep.txs.entries()) {
      onStep(`Review and sign on the device (${i + 1}/${prep.txs.length}): ${t.vendor}, ${t.amount.toLocaleString('en-US')} RLUSD`);
      signed.push({ bill: t.bill, tx: t.tx, signature: await xrp.signTransaction(PATH, t.blob) });
    }
    onStep('Submitting to the XRP Ledger');
    return (await api<{ results: LedgerResult[] }>('/api/business/ledger/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signed }) })).results;
  } finally {
    await transport.close();
  }
}
