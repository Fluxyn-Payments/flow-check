// Adds a supplier that is paid in fiat (no wallet use): it still gets a Pass on XRPL from a network issuer,
// so Flow Check can verify it before a cross-border payout through Ripple Payments Direct.
import { readFile, writeFile } from 'node:fs/promises';
import { Client, Wallet } from 'xrpl';
import { toHex } from '../src/index.js';

const state = JSON.parse(await readFile('.flowcheck/testnet.json', 'utf8'));
const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();
const vasp = Wallet.fromSeed(state.issuers.vasp.seed);
const { wallet: supplier } = state.suppliers.mx ? { wallet: Wallet.fromSeed(state.suppliers.mx.seed) } : await client.fundWallet();
const type = toHex('KYB_VERIFIED');
for (const [label, tx, w] of [
  ['issuer: CredentialCreate KYB_VERIFIED (Estudio Bruma)', { TransactionType: 'CredentialCreate', Account: vasp.address, Subject: supplier.address, CredentialType: type, URI: toHex('flowcheck:kyb:supplier-mx') }, vasp],
  ['supplier: CredentialAccept', { TransactionType: 'CredentialAccept', Account: supplier.address, Issuer: vasp.address, CredentialType: type }, supplier],
] as const) {
  const res = await client.submitAndWait(tx as any, { wallet: w as Wallet, autofill: true });
  console.log((res.result.meta as any).TransactionResult, label, `https://testnet.xrpl.org/transactions/${res.result.hash}`);
}
state.suppliers.mx = { address: supplier.address, seed: supplier.seed };
await writeFile('.flowcheck/testnet.json', JSON.stringify(state, null, 2));
await client.disconnect();
