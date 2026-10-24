// Builds a Flow Check network on XRPL testnet and writes its state (with seeds) to .flowcheck/
// Usage: pnpm setup:testnet
import { mkdir, writeFile } from 'node:fs/promises';
import { Client, Wallet, type SubmittableTransaction } from 'xrpl';
import { sign } from 'ripple-keypairs';
import { canonical, currencyCode, sha256Hex, toHex, type Mandate } from '../src/index.js';

const client = new Client('wss://s.altnet.rippletest.net:51233');
const RLUSD = 'RLUSD';

async function fund(label: string) {
  const { wallet } = await client.fundWallet();
  console.log(`funded  ${label.padEnd(12)} ${wallet.address}`);
  return wallet;
}

async function submit(label: string, tx: SubmittableTransaction, wallet: Wallet) {
  const res = await client.submitAndWait(tx, { wallet, autofill: true });
  const code = (res.result.meta as any)?.TransactionResult;
  console.log(`${code === 'tesSUCCESS' ? 'ok     ' : 'FAILED '} ${label} ${code} https://testnet.xrpl.org/transactions/${res.result.hash}`);
  if (code !== 'tesSUCCESS') throw new Error(`${label}: ${code}`);
  return res.result.hash;
}

async function main() {
  await client.connect();

  // Issuers on the network: a VASP (full KYB) and a PSP (basic KYB), plus a test RLUSD issuer
  const vasp = await fund('issuer VASP');
  const psp = await fund('issuer PSP');
  const token = await fund('RLUSD issuer');
  const company = await fund('business');
  const agent = await fund('agent');
  const supplierA = await fund('supplier A');   // Pass from the VASP
  const supplierB = await fund('supplier B');   // Pass from the PSP
  const vendor = await fund('vendor');          // no Pass
  const rogue = await fund('rogue agent');      // no KYA, no Pass

  // Test RLUSD
  await submit('RLUSD issuer: DefaultRipple', { TransactionType: 'AccountSet', Account: token.address, SetFlag: 8 }, token);
  for (const [label, w] of [['business', company], ['supplier A', supplierA], ['supplier B', supplierB], ['vendor', vendor]] as const) {
    await submit(`${label}: trust line RLUSD`, { TransactionType: 'TrustSet', Account: w.address, LimitAmount: { currency: currencyCode(RLUSD), issuer: token.address, value: '10000000' } }, w);
  }
  await submit('RLUSD → business 100,000', { TransactionType: 'Payment', Account: token.address, Destination: company.address, Amount: { currency: currencyCode(RLUSD), issuer: token.address, value: '100000' } }, token);

  // Passes (KYB) and the agent credential (KYA)
  const issue = async (issuer: Wallet, subject: Wallet, type: string, uri: string, label: string) => {
    await submit(`${label}: CredentialCreate ${type}`, { TransactionType: 'CredentialCreate', Account: issuer.address, Subject: subject.address, CredentialType: toHex(type), URI: toHex(uri) }, issuer);
    await submit(`${label}: CredentialAccept ${type}`, { TransactionType: 'CredentialAccept', Account: subject.address, Issuer: issuer.address, CredentialType: toHex(type) }, subject);
  };
  await issue(vasp, company, 'KYB_VERIFIED', 'flowcheck:kyb:business', 'business');
  await issue(vasp, supplierA, 'KYB_VERIFIED', 'flowcheck:kyb:supplier-a', 'supplier A');
  await issue(psp, supplierB, 'KYB_BASIC', 'flowcheck:kyb:supplier-b', 'supplier B');
  // The agent credential is issued after the Mandate (it expires with it); see below

  // Deposit gate on the suppliers: only payers holding a Pass from a network issuer.
  // Each DepositPreauth lists credentials that are required together, so one per accepted issuer.
  for (const [label, w] of [['supplier A', supplierA], ['supplier B', supplierB]] as const) {
    await submit(`${label}: DepositAuth`, { TransactionType: 'AccountSet', Account: w.address, SetFlag: 9 }, w);
    await submit(`${label}: accept VASP Pass`, { TransactionType: 'DepositPreauth', Account: w.address, AuthorizeCredentials: [{ Credential: { Issuer: vasp.address, CredentialType: toHex('KYB_VERIFIED') } }] } as any, w);
    await submit(`${label}: accept PSP Pass`, { TransactionType: 'DepositPreauth', Account: w.address, AuthorizeCredentials: [{ Credential: { Issuer: psp.address, CredentialType: toHex('KYB_BASIC') } }] } as any, w);
  }

  // The business delegates payments to its agent
  await submit('business: DelegateSet Payment → agent', { TransactionType: 'DelegateSet', Account: company.address, Authorize: agent.address, Permissions: [{ Permission: { PermissionValue: 'Payment' } }] } as any, company);

  // The Mandate: signed by the business, anchored on the agent account
  const now = new Date();
  const mandate: Mandate = {
    schema: 'passport.mandate/v1',
    network: 'xrpl-testnet',
    version: 1,
    agent: agent.address,
    principal: company.address,
    credential: { issuer: vasp.address, type: 'KYB_VERIFIED' },
    enabled: true,
    permissions: { pay: 'EXECUTE', collect: 'VIEW', treasury: 'OFF' },
    limits: { currency: 'USD', perPayment: 5000, daily: 250000, monthly: 1000000 },
    rules: [],
    counterparties: { onchain: 'PASSPORT_NETWORK' },
    issuedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + 90 * 86400_000).toISOString(),
  };
  const hash = sha256Hex(canonical(mandate));
  const signature = sign(hash, company.privateKey);
  await mkdir('.flowcheck/mandates', { recursive: true });
  await writeFile(`.flowcheck/mandates/${hash}.json`, JSON.stringify({ mandate, signature, publicKey: company.publicKey }, null, 2));
  // KYA: the business's issuer attests the agent, bound to the business (and to its XRPL EVM address when known),
  // expiring with the Mandate. The business anchors the current Mandate on its own account.
  const evm = process.env.AGENT_EVM && /^0x[0-9a-fA-F]{40}$/.test(process.env.AGENT_EVM) ? `:evm:${process.env.AGENT_EVM}` : '';
  await submit('agent: CredentialCreate AGENT_AUTHORIZED', { TransactionType: 'CredentialCreate', Account: vasp.address, Subject: agent.address, CredentialType: toHex('AGENT_AUTHORIZED'), Expiration: Math.floor(new Date(mandate.validUntil).getTime() / 1000) - 946684800, URI: toHex(`flowcheck:agent:principal:${company.address}${evm}`) } as any, vasp);
  await submit('agent: CredentialAccept AGENT_AUTHORIZED', { TransactionType: 'CredentialAccept', Account: agent.address, Issuer: vasp.address, CredentialType: toHex('AGENT_AUTHORIZED') }, agent);
  await submit('business: DIDSet (current Mandate)', { TransactionType: 'DIDSet', Account: company.address, Data: hash, URI: toHex(`flowcheck:mandate:${hash}`) } as any, company);
  await submit('agent: DIDSet (Mandate hash)', { TransactionType: 'DIDSet', Account: agent.address, Data: hash, URI: toHex(`flowcheck:mandate:${hash}`) } as any, agent);

  const w = (x: Wallet) => ({ address: x.address, seed: x.seed });
  const state = {
    network: 'testnet',
    createdAt: now.toISOString(),
    issuers: { vasp: w(vasp), psp: w(psp) },
    rlusdIssuer: w(token),
    business: w(company),
    agent: w(agent),
    suppliers: { a: w(supplierA), b: w(supplierB) },
    vendor: w(vendor),
    rogue: w(rogue),
    mandateHash: hash,
  };
  await writeFile('.flowcheck/testnet.json', JSON.stringify(state, null, 2));
  console.log('\nState written to .flowcheck/testnet.json (contains seeds; git-ignored).');
  await client.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await client.disconnect().catch(() => {});
  process.exit(1);
});
