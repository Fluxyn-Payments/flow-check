// Creates the Agent and Merchant submitter wallets for AP4M. Keys stay in .flowcheck/ (git-ignored); only addresses are printed.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { Wallet } from 'ethers';
const dir = '../flow-check/.flowcheck';
const file = `${dir}/ap4m-wallets.json`;
try { await access(file); console.log('Already exists:', file); process.exit(0); } catch {}
const agent = Wallet.createRandom();
const submitter = Wallet.createRandom();
await mkdir(dir, { recursive: true });
await writeFile(file, JSON.stringify({ agent: { address: agent.address, privateKey: agent.privateKey }, submitter: { address: submitter.address, privateKey: submitter.privateKey } }, null, 2), { mode: 0o600 });
console.log('agent    ', agent.address);
console.log('submitter', submitter.address);
