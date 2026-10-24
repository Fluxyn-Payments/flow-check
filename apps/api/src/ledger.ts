import { Wallet, deriveAddress, encode } from 'xrpl';
import { currencyCode, type FlowCheck } from '@fluxyn/flow-check';
import type { State } from './app.js';
import { agentOf, bills, type AgentKey } from './agent.js';

// Human approval on a Ledger device. The CFO's Ledger is the business account's regular key, so the device
// signs the over-limit payment itself: the server builds the transaction and submits it, but never signs it.
export type Signer = { publicKey: string };

// Demo setup, once per device: the business account delegates its signing to the CFO's Ledger (SetRegularKey)
async function ensureRegularKey(fc: FlowCheck, s: State, ledgerAddress: string) {
  const business = Wallet.fromSeed(s.business.seed);
  const info: any = await fc.client.request({ command: 'account_info', account: business.address } as any);
  if (info.result.account_data.RegularKey === ledgerAddress) return null;
  const res = await fc.client.submitAndWait({ TransactionType: 'SetRegularKey', Account: business.address, RegularKey: ledgerAddress } as any, { wallet: business, autofill: true });
  return { engineResult: (res.result.meta as any)?.TransactionResult as string, hash: res.result.hash, explorer: fc.txUrl(res.result.hash) };
}

// Re-check each bill with Flow Check, then return the unsigned payments for the device (one per bill)
export async function prepareLedgerApproval(fc: FlowCheck, s: State, key: AgentKey, billIds: string[], signer: Signer) {
  const publicKey = signer.publicKey.toUpperCase();
  if (!/^0[23][0-9A-F]{64}$/.test(publicKey)) throw new Error('expected a secp256k1 public key from the device');
  const ledgerAddress = deriveAddress(publicKey);
  const regularKey = await ensureRegularKey(fc, s, ledgerAddress);

  const agent = agentOf(s, key).address;
  const business = Wallet.fromSeed(s.business.seed);
  const pass = await fc.verifyPass(business.address);
  const chosen = bills(s, key).filter((b) => billIds.includes(b.id) && !('rail' in b)).slice(0, 8);
  const txs = [];
  let sequence: number | undefined;
  for (const b of chosen) {
    const check = await fc.checkMandate(agent, { destination: b.destination, amount: b.amount, currency: b.currency, category: b.category });
    if (check.decision === 'DENY') continue;
    const tx: any = await fc.client.autofill({
      TransactionType: 'Payment', Account: business.address, Destination: b.destination,
      Amount: { currency: currencyCode(b.currency), issuer: s.rlusdIssuer.address, value: String(b.amount) },
      ...(pass.credential ? { CredentialIDs: [pass.credential.index] } : {}),
    } as any);
    sequence = sequence === undefined ? tx.Sequence : sequence + 1;
    tx.Sequence = sequence;
    tx.LastLedgerSequence += 40; // time for the CFO to read the device
    tx.SigningPubKey = publicKey;
    txs.push({ bill: b.id, vendor: b.vendor, amount: b.amount, currency: b.currency, tx, blob: encode(tx) });
  }
  return { ledgerAddress, regularKey, txs };
}

// Attach the device's signature and submit; only Payments from the business account are accepted
export async function submitLedgerApproval(fc: FlowCheck, s: State, signed: { bill: string; tx: any; signature: string }[]) {
  const results = [];
  for (const { bill, tx, signature } of signed.slice(0, 8)) {
    if (tx?.TransactionType !== 'Payment' || tx.Account !== s.business.address || !/^[0-9A-Fa-f]{100,150}$/.test(signature)) {
      results.push({ bill, status: 'REJECTED', error: 'not a business payment' });
      continue;
    }
    const res = await fc.client.submitAndWait(encode({ ...tx, TxnSignature: signature.toUpperCase() }) as any);
    const engineResult = (res.result.meta as any)?.TransactionResult as string;
    results.push({ bill, status: engineResult === 'tesSUCCESS' ? 'PAID' : 'FAILED', approval: 'Signed on the CFO\'s Ledger device', engineResult, hash: res.result.hash, explorer: fc.txUrl(res.result.hash) });
  }
  return { results };
}
