// Pays two suppliers in one atomic Batch signed by the business (ALLORNOTHING).
import { readFile } from 'node:fs/promises';
import { Client, Wallet } from 'xrpl';
import { currencyCode } from '../src/index.js';

const s = JSON.parse(await readFile('.flowcheck/testnet.json', 'utf8'));
const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();
const business = Wallet.fromSeed(s.business.seed);
const creds: any = await client.request({ command: 'account_objects', account: business.address, type: 'credential' } as any);
const credId = creds.result.account_objects.find((o: any) => o.Subject === business.address)?.index;
const amount = (v: string) => ({ currency: currencyCode('RLUSD'), issuer: s.rlusdIssuer.address, value: v });
const inner = (to: string, v: string) => ({ RawTransaction: { TransactionType: 'Payment', Account: business.address, Destination: to, Amount: amount(v), Flags: 0x40000000, CredentialIDs: [credId] } });
const tx: any = { TransactionType: 'Batch', Account: business.address, Flags: 0x00010000, RawTransactions: [inner(s.suppliers.a.address, '10'), inner(s.suppliers.b.address, '15')] };
const prepared = await client.autofill(tx);
console.log(JSON.stringify(prepared.RawTransactions.map((r: any) => ({ seq: r.RawTransaction.Sequence, fee: r.RawTransaction.Fee }))), 'outer fee', prepared.Fee);
const res = await client.submitAndWait(prepared, { wallet: business });
console.log((res.result.meta as any)?.TransactionResult, `https://testnet.xrpl.org/transactions/${res.result.hash}`);
await client.disconnect();
