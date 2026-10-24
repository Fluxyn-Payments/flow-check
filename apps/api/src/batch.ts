import { Wallet } from 'xrpl';
import { currencyCode, type FlowCheck } from '@fluxyn/flow-check';
import type { State } from './app.js';
import { agentOf, bills, type AgentKey } from './agent.js';

const tfAllOrNothing = 0x00010000;
const tfInnerBatchTxn = 0x40000000;

// The CFO approves several bills at once: Flow Check re-checks each one, then the business signs a single
// atomic Batch (ALLORNOTHING): every payment settles in the same ledger, or none does.
export async function approveBatch(fc: FlowCheck, s: State, key: AgentKey, billIds: string[]) {
  const agent = agentOf(s, key).address;
  const chosen = bills(s, key).filter((b) => billIds.includes(b.id)).slice(0, 8);
  if (chosen.length === 0) return { status: 'NOTHING_TO_APPROVE' };

  const checked = await Promise.all(chosen.map(async (b) => ({ b, r: await fc.checkMandate(agent, { destination: b.destination, amount: b.amount, currency: b.currency, category: b.category }) })));
  const refused = checked.filter((c) => c.r.decision === 'DENY').map((c) => ({ bill: c.b.id, failed: c.r.checks.filter((x) => !x.ok && x.effect === 'DENY').map((x) => `${x.label}: ${x.detail}`) }));
  const approvable = checked.filter((c) => c.r.decision !== 'DENY');
  if (approvable.length === 0) return { status: 'REFUSED', refused };

  const business = Wallet.fromSeed(s.business.seed);
  const pass = await fc.verifyPass(business.address);
  const payment = (b: (typeof approvable)[number]['b'], inner: boolean) => ({
    TransactionType: 'Payment', Account: business.address, Destination: b.destination, ...(inner ? { Flags: tfInnerBatchTxn } : {}),
    Amount: { currency: currencyCode(b.currency), issuer: s.rlusdIssuer.address, value: String(b.amount) },
    ...(pass.credential ? { CredentialIDs: [pass.credential.index] } : {}),
  });
  // A Batch holds 2 to 8 transactions; a single approval is a plain payment signed by the business
  if (approvable.length === 1) {
    const res = await fc.client.submitAndWait(await fc.client.autofill(payment(approvable[0].b, false) as any), { wallet: business });
    const engineResult = (res.result.meta as any)?.TransactionResult as string;
    return { status: engineResult === 'tesSUCCESS' ? 'PAID' : 'FAILED', approval: 'SIMULATED: signed with the business key on the server', mode: 'SINGLE', bills: [approvable[0].b.id], refused, engineResult, hash: res.result.hash, explorer: fc.txUrl(res.result.hash) };
  }
  const tx: any = {
    TransactionType: 'Batch', Account: business.address, Flags: tfAllOrNothing,
    RawTransactions: approvable.map(({ b }) => ({ RawTransaction: payment(b, true) })),
  };
  const res = await fc.client.submitAndWait(await fc.client.autofill(tx), { wallet: business });
  const engineResult = (res.result.meta as any)?.TransactionResult as string;
  return {
    status: engineResult === 'tesSUCCESS' ? 'PAID' : 'FAILED',
    approval: 'SIMULATED: signed with the business key on the server',
    mode: 'ALLORNOTHING', bills: approvable.map((c) => c.b.id), refused,
    engineResult, hash: res.result.hash, explorer: fc.txUrl(res.result.hash),
  };
}
