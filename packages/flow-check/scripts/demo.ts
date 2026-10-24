// Runs the demo scenes against the network built by setup-testnet.
// Usage: pnpm demo
import { readFile } from 'node:fs/promises';
import { Wallet, type Payment } from 'xrpl';
import { FlowCheck, type Check } from '../src/index.js';

const state = JSON.parse(await readFile('.flowcheck/testnet.json', 'utf8'));
const fc = new FlowCheck({ network: 'testnet', issuers: [state.issuers.vasp.address, state.issuers.psp.address] });
const agent = Wallet.fromSeed(state.agent.seed);
const business = Wallet.fromSeed(state.business.seed);
const rogue = Wallet.fromSeed(state.rogue.seed);
const RLUSD = { currency: 'RLUSD', tokenIssuer: state.rlusdIssuer.address };

const show = (checks: Check[]) => checks.forEach((c) => console.log(`   ${c.ok ? '✓' : c.effect === 'DENY' ? '✗' : '!'} ${c.label}: ${c.detail}`));
const title = (s: string) => console.log(`\n── ${s}`);

await fc.connect();

title('KYA · who is this agent?');
const kya = await fc.verifyAgent(agent.address);
console.log(`   authorized: ${kya.authorized} · acts for ${kya.principal}`);
show(kya.checks);

title('1 · supplier A holds a Pass · 1,200 RLUSD');
const one = await fc.payWithPass({ agent, destination: state.suppliers.a.address, amount: 1200, ...RLUSD });
console.log(`   ${one.decision} → ${one.status} ${one.engineResult ?? ''} ${one.explorer ?? ''}`);

title('2 · over the Mandate · 6,000 RLUSD');
const two = await fc.payWithPass({ agent, destination: state.suppliers.b.address, amount: 6000, ...RLUSD });
console.log(`   ${two.decision} → ${two.status}`);
show(two.checks.filter((c) => !c.ok));
if (two.pendingTx) {
  // The approver signs as the business. In the demo this is the Ledger device.
  const { Delegate, ...approved } = two.pendingTx as Payment & { Delegate?: string };
  const res = await fc.client.submitAndWait(approved as Payment, { wallet: business, autofill: true });
  console.log(`   approved and signed by the business → ${(res.result.meta as any).TransactionResult} ${fc.txUrl(res.result.hash)}`);
}

title('3a · vendor without a Pass · 300 RLUSD');
const three = await fc.payWithPass({ agent, destination: state.vendor.address, amount: 300, ...RLUSD });
console.log(`   ${three.decision} → ${three.status}: Flow Check does not pay it`);
show(three.checks.filter((c) => !c.ok));

title('3b · an agent without KYA pays a verified supplier directly, skipping Flow Check');
const rogueKya = await fc.verifyAgent(rogue.address);
console.log(`   Flow Check: authorized ${rogueKya.authorized}`);
const res = await fc.client.submitAndWait({ TransactionType: 'Payment', Account: rogue.address, Destination: state.suppliers.a.address, Amount: '10000000' }, { wallet: rogue, autofill: true }).catch((e) => e);
const code = res?.result?.meta?.TransactionResult ?? res?.data?.engine_result ?? String(res?.message ?? res);
console.log(`   ledger: ${code} ${res?.result?.hash ? fc.txUrl(res.result.hash) : ''}  ← refused by the validators`);

await fc.disconnect();
