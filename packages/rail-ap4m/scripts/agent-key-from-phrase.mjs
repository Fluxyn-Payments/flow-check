// Derives the first Ethereum account from a recovery phrase read on stdin, checks it matches the expected
// Agent address, and stores the private key in .flowcheck/ (git-ignored). Never prints the phrase or the key.
// Usage: pbpaste | node scripts/agent-key-from-phrase.mjs 0xExpectedAgentAddress
import { writeFile } from 'node:fs/promises';
import { HDNodeWallet } from 'ethers';

const expected = (process.argv[2] ?? '').toLowerCase();
let phrase = '';
for await (const chunk of process.stdin) phrase += chunk;
phrase = phrase.trim().toLowerCase().split(/\s+/).join(' ');

let wallet;
try {
  wallet = HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0");
} catch {
  console.error('The clipboard does not contain a valid recovery phrase.');
  process.exit(1);
}
if (expected && wallet.address.toLowerCase() !== expected) {
  console.error(`The phrase derives ${wallet.address}, not ${expected}. Nothing was saved.`);
  process.exit(1);
}
await writeFile(new URL('../../flow-check/.flowcheck/agent-private-key', import.meta.url), wallet.privateKey, { mode: 0o600 });
console.log(`Saved the Agent key for ${wallet.address} in packages/flow-check/.flowcheck/agent-private-key`);
