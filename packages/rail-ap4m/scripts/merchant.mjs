// Fluxyn's x402 Merchant: sells a Flow Check network report, paid through AP4M with a Voucher.
// Usage: node scripts/merchant.mjs   (RESOURCE_URL must be https://.../resource when served publicly)
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import sdk from '../vendor/ap4m-hackathon-sdk.cjs';
import { createX402Merchant, loadX402Context } from '../vendor/ap4m-x402.mjs';
import { API, TEAM, FLOWCHECK_API, STATE, network, agentWallet } from './common.mjs';

const PORT = Number(process.env.PORT ?? 4308);
const RESOURCE_URL = process.env.RESOURCE_URL ?? `http://127.0.0.1:${PORT}/resource`;
const PRICE_RLUSD = process.env.PRICE_RLUSD ?? '1';

const { provider } = await network();
const agent = await agentWallet(provider);
const { token } = await sdk.signIn(API, TEAM, agent);
const me = await (await fetch(`${API}/public/participant/me`, { headers: { Authorization: `Bearer ${token}` } })).json();

// The resource: the verified network, read from the XRP Ledger by Flow Check when the Merchant starts
const dir = await (await fetch(`${FLOWCHECK_API}/api/directory`)).json();
const content = {
  product: 'Fluxyn Flow Check · network report',
  source: 'XRP Ledger testnet',
  counts: dir.counts,
  issuers: dir.issuers.map((i) => ({ name: i.name, type: i.type, address: i.address })),
  agents: dir.agents.map((a) => ({ address: a.address, status: a.status, principal: a.principal })),
  generatedAt: new Date().toISOString().slice(0, 16),
};

// Gas payer for redeeming Vouchers. Uses the dedicated submitter key when it has gas, otherwise the Agent key.
const submitterKey = process.env.MERCHANT_SUBMITTER_KEY;
const submitter = submitterKey ? new ethers.Wallet(submitterKey, provider) : agent;

const merchant = createX402Merchant({
  context: await loadX402Context(API),
  provider,
  submitter,
  stateDirectory: fileURLToPath(new URL('ap4m-merchant-state', STATE)),
  resourceUrl: RESOURCE_URL,
  merchantParticipantId: me.team.merchant_id,
  payout: me.team.merchant_wallet,
  amount: ethers.parseUnits(PRICE_RLUSD, 18).toString(),
  content,
});
merchant.server.listen(PORT, process.env.HOST ?? '127.0.0.1', () => console.log(`Merchant selling ${RESOURCE_URL} for ${PRICE_RLUSD} RLUSD · payout ${me.team.merchant_wallet}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { merchant.close().finally(() => process.exit(0)); });
