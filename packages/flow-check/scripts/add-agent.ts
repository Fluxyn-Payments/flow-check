// Adds a second agent to the demo business (a Marketing agent with a quarterly budget and allowed categories)
// and anchors the business's Mandate set, so each agent's current Mandate is on the ledger.
// Usage: pnpm tsx scripts/add-agent.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Client, Wallet, type SubmittableTransaction } from 'xrpl';
import { sign } from 'ripple-keypairs';
import { canonical, sha256Hex, toHex, type Mandate, type MandateSet } from '../src/index.js';

const RIPPLE_EPOCH = 946684800;
const state = JSON.parse(await readFile('.flowcheck/testnet.json', 'utf8'));
const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();

async function submit(label: string, tx: SubmittableTransaction, wallet: Wallet) {
  const res = await client.submitAndWait(tx, { wallet, autofill: true });
  const code = (res.result.meta as any)?.TransactionResult;
  console.log(`${code === 'tesSUCCESS' ? 'ok     ' : 'FAILED '} ${label} ${code} https://testnet.xrpl.org/transactions/${res.result.hash}`);
  if (code !== 'tesSUCCESS') throw new Error(`${label}: ${code}`);
}

const vasp = Wallet.fromSeed(state.issuers.vasp.seed);
const business = Wallet.fromSeed(state.business.seed);
const { wallet: marketing } = state.agents?.marketing ? { wallet: Wallet.fromSeed(state.agents.marketing.seed) } : await client.fundWallet();
console.log('marketing agent', marketing.address);

// The Mandate: smaller limits, a quarterly budget, and only marketing categories
const now = new Date();
const mandate: Mandate = {
  schema: 'passport.mandate/v1',
  network: 'xrpl-testnet',
  version: 1,
  agent: marketing.address,
  principal: business.address,
  credential: { issuer: vasp.address, type: 'KYB_VERIFIED' },
  enabled: true,
  permissions: { pay: 'EXECUTE', collect: 'OFF', treasury: 'OFF' },
  limits: { currency: 'USD', perPayment: 2000, daily: 5000, monthly: 10000, quarterly: 25000 },
  categories: ['ads', 'design', 'events'],
  rules: [],
  counterparties: { onchain: 'PASSPORT_NETWORK' },
  issuedAt: now.toISOString(),
  validUntil: new Date(now.getTime() + 90 * 86400_000).toISOString(),
};
const hash = sha256Hex(canonical(mandate));
await mkdir('.flowcheck/mandates', { recursive: true });
await writeFile(`.flowcheck/mandates/${hash}.json`, JSON.stringify({ mandate, signature: sign(hash, business.privateKey), publicKey: business.publicKey }, null, 2));

// Attestation by the business's issuer, expiring with the Mandate
const type = toHex('AGENT_AUTHORIZED');
const existing: any = await client.request({ command: 'account_objects', account: marketing.address, type: 'credential' } as any);
if (!existing.result.account_objects.some((o: any) => o.CredentialType === type)) {
  await submit('issuer: CredentialCreate AGENT_AUTHORIZED (marketing)', {
    TransactionType: 'CredentialCreate', Account: vasp.address, Subject: marketing.address, CredentialType: type,
    Expiration: Math.floor(new Date(mandate.validUntil).getTime() / 1000) - RIPPLE_EPOCH,
    URI: toHex(`flowcheck:agent:principal:${business.address}`),
  } as any, vasp);
  await submit('marketing: CredentialAccept', { TransactionType: 'CredentialAccept', Account: marketing.address, Issuer: vasp.address, CredentialType: type } as any, marketing);
}
await submit('business: DelegateSet Payment → marketing agent', { TransactionType: 'DelegateSet', Account: business.address, Authorize: marketing.address, Permissions: [{ Permission: { PermissionValue: 'Payment' } }] } as any, business);
await submit('marketing: DIDSet (Mandate hash)', { TransactionType: 'DIDSet', Account: marketing.address, Data: hash, URI: toHex(`flowcheck:mandate:${hash}`) } as any, marketing);

// The business's Mandate set: the current Mandate of each agent
const set: MandateSet = { schema: 'flowcheck.mandate-set/v1', principal: business.address, agents: { [state.agent.address]: state.mandateHash, [marketing.address]: hash }, issuedAt: now.toISOString() };
const setHash = sha256Hex(canonical(set));
await mkdir('.flowcheck/mandate-sets', { recursive: true });
await writeFile(`.flowcheck/mandate-sets/${setHash}.json`, JSON.stringify(set, null, 2));
await submit('business: DIDSet (Mandate set)', { TransactionType: 'DIDSet', Account: business.address, Data: setHash, URI: toHex(`flowcheck:mandate-set:${setHash}`) } as any, business);

state.agents = { ...(state.agents ?? {}), marketing: { address: marketing.address, seed: marketing.seed, mandateHash: hash } };
state.mandateSetHash = setHash;
await writeFile('.flowcheck/testnet.json', JSON.stringify(state, null, 2));
console.log('State updated.');
await client.disconnect();
