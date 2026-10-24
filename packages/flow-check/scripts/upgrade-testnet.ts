// Upgrades an existing testnet network (from setup-testnet) to the legal model of Oct 24:
// the agent credential expires with the Mandate and binds the agent's XRPL EVM address,
// and the business anchors its current Mandate on its own account.
// Usage: AGENT_EVM=0x... pnpm tsx scripts/upgrade-testnet.ts
import { readFile } from 'node:fs/promises';
import { Client, Wallet, type SubmittableTransaction } from 'xrpl';
import { toHex, type SignedMandate } from '../src/index.js';

const RIPPLE_EPOCH = 946684800;
const state = JSON.parse(await readFile('.flowcheck/testnet.json', 'utf8'));
const signed: SignedMandate = JSON.parse(await readFile(`.flowcheck/mandates/${state.mandateHash}.json`, 'utf8'));
const evm = process.env.AGENT_EVM;
if (!evm || !/^0x[0-9a-fA-F]{40}$/.test(evm)) throw new Error('Set AGENT_EVM to the agent XRPL EVM address');

const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();
const vasp = Wallet.fromSeed(state.issuers.vasp.seed);
const agent = Wallet.fromSeed(state.agent.seed);
const business = Wallet.fromSeed(state.business.seed);

async function submit(label: string, tx: SubmittableTransaction, wallet: Wallet) {
  const res = await client.submitAndWait(tx, { wallet, autofill: true });
  const code = (res.result.meta as any)?.TransactionResult;
  console.log(`${code === 'tesSUCCESS' ? 'ok     ' : 'FAILED '} ${label} ${code} https://testnet.xrpl.org/transactions/${res.result.hash}`);
  if (code !== 'tesSUCCESS') throw new Error(`${label}: ${code}`);
}

const type = toHex('AGENT_AUTHORIZED');
const expiration = Math.floor(new Date(signed.mandate.validUntil).getTime() / 1000) - RIPPLE_EPOCH;
await submit('issuer: CredentialDelete AGENT_AUTHORIZED', { TransactionType: 'CredentialDelete', Account: vasp.address, Subject: agent.address, CredentialType: type } as any, vasp);
await submit('issuer: CredentialCreate AGENT_AUTHORIZED (expires with the Mandate, binds the EVM address)', {
  TransactionType: 'CredentialCreate', Account: vasp.address, Subject: agent.address, CredentialType: type,
  Expiration: expiration, URI: toHex(`flowcheck:agent:principal:${business.address}:evm:${evm}`),
} as any, vasp);
await submit('agent: CredentialAccept', { TransactionType: 'CredentialAccept', Account: agent.address, Issuer: vasp.address, CredentialType: type } as any, agent);
await submit('business: DIDSet (current Mandate)', { TransactionType: 'DIDSet', Account: business.address, Data: state.mandateHash, URI: toHex(`flowcheck:mandate:${state.mandateHash}`) } as any, business);
await client.disconnect();
