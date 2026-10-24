// The agent pays through AP4M, but only after Flow Check clears it on the XRP Ledger.
// Usage: node scripts/pay.mjs [operation-name]
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import sdk from '../vendor/ap4m-hackathon-sdk.cjs';
import { buyResource, loadX402Context } from '../vendor/ap4m-x402.mjs';
import { API, TEAM, FLOWCHECK_API, STATE, network, agentWallet, explorerTx } from './common.mjs';

const RESOURCE_URL = process.env.RESOURCE_URL ?? 'http://127.0.0.1:4308/resource';
const CHANNEL_CAP = process.env.CHANNEL_CAP ?? '3';
const MAXIMUM_PRICE = process.env.MAXIMUM_PRICE ?? '1';
const OPERATION = process.argv[2] ?? `purchase-${Date.now()}`;

// 1 · Flow Check on the XRP Ledger: the agent must be attested, delegated and bound by a Mandate
const net = await (await fetch(`${FLOWCHECK_API}/api/network`)).json();
const kya = await (await fetch(`${FLOWCHECK_API}/api/agent/${net.agent}`)).json();
console.log(`[Flow Check] agent ${net.agent} authorized: ${kya.authorized}`);
if (!kya.authorized) {
  for (const c of kya.checks.filter((c) => !c.ok)) console.log(`  ✗ ${c.label}: ${c.detail}`);
  process.exit(1);
}

// 2 · AP4M on XRPL EVM, only with the EVM wallet that the agent credential binds
const { config, provider } = await network();
const agent = await agentWallet(provider);
if (kya.evm?.toLowerCase() !== agent.address.toLowerCase()) {
  console.log(`[Flow Check] ✗ the agent credential binds ${kya.evm ?? 'no EVM wallet'}, not ${agent.address}. Not paying.`);
  process.exit(1);
}
console.log(`[Flow Check] ✓ the agent credential binds this EVM wallet ${agent.address}`);
const { token } = await sdk.signIn(API, TEAM, agent);
const me = await (await fetch(`${API}/public/participant/me`, { headers: { Authorization: `Bearer ${token}` } })).json();

let channelId = process.env.CHANNEL_ID ?? (me.paymentState.channel_status === 'open' ? me.paymentState.channel_id : null);
if (channelId && !process.env.CHANNEL_ID) {
  // A full channel cannot take another voucher: open a new one from the budget
  const s = await sdk.getChannelState(provider, config.contracts.paymentLedger, channelId);
  if (BigInt(s.redeemed) + ethers.parseUnits(MAXIMUM_PRICE, 18) > BigInt(s.cap)) channelId = null;
}
if (!channelId) {
  console.log(`[AP4M] opening a Channel to our Merchant with a ${CHANNEL_CAP} RLUSD cap…`);
  const channel = await sdk.requestChannel(API, token, agent, { capRlusd: CHANNEL_CAP, merchantId: me.team.merchant_id, rpcUrl: config.network.rpcUrl });
  channelId = channel.channel_id;
}
console.log(`[AP4M] channel ${channelId}`);

console.log(`[AP4M] buying ${RESOURCE_URL} (HTTP 402 → signed Voucher)…`);
const purchase = await buyResource({
  context: await loadX402Context(API), provider, wallet: agent,
  stateDirectory: fileURLToPath(new URL('ap4m-agent-state', STATE)), resourceUrl: RESOURCE_URL,
  channelId, maximumAmount: ethers.parseUnits(MAXIMUM_PRICE, 18).toString(), operation: OPERATION,
});
console.log(`[AP4M] resource received: ${JSON.stringify(purchase.resource).slice(0, 160)}…`);
console.log(`[AP4M] VoucherRedeemed ${explorerTx(config, purchase.transactionHash)}`);

const rec = await fetch(`${API}/public/participant/record-redemption`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ tx_hash: purchase.transactionHash }) });
if (!rec.ok) console.log(`[AP4M] record-redemption: ${(await rec.json()).error}`);
if (process.env.SETTLE !== '0') {
  const settled = await sdk.settle(API, token, channelId);
  console.log(`[AP4M] RLUSD paid to the Merchant ${explorerTx(config, settled.payout_tx)}`);
  if (settled.receipt_url) console.log(`[AP4M] receipt ${API}${settled.receipt_url}`);
}
