// Proves the contract enforces the channel cap: the agent signs a Voucher above the cap and tries to redeem it.
// Usage: node scripts/over-cap.mjs [cumulativeRlusd]
import { ethers } from 'ethers';
import sdk from '../vendor/ap4m-hackathon-sdk.cjs';
import { API, TEAM, network, agentWallet } from './common.mjs';

const { config, provider } = await network();
const agent = await agentWallet(provider);
const { token } = await sdk.signIn(API, TEAM, agent);
const me = await (await fetch(`${API}/public/participant/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
const channelId = me.paymentState.channel_id;
const state = await sdk.getChannelState(provider, config.contracts.paymentLedger, channelId);
console.log('channel', channelId, 'state', JSON.stringify(state, (_, v) => (typeof v === 'bigint' ? ethers.formatUnits(v, 18) : v)));
const amount = ethers.parseUnits(process.argv[2] ?? '4', 18);
try {
  const r = await sdk.redeemVoucher(agent, config.contracts.paymentLedger, config.network.rpcUrl, channelId, amount.toString());
  console.log('UNEXPECTED: redeemed', JSON.stringify(r));
} catch (e) {
  console.log('REFUSED by PaymentLedger:', (e.shortMessage ?? e.message).slice(0, 300));
  if (e.reason) console.log('reason:', e.reason);
}
