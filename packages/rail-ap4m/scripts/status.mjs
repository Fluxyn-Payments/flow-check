// Signs in to AP4M with the Agent key and prints the team state. Moves no funds.
import { readFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import sdk from '../vendor/ap4m-hackathon-sdk.cjs';

const API = process.env.AP4M_API_URL ?? 'https://hackathon.ap4m.build';
const TEAM = process.env.TEAM_NAME ?? 'Fluxyn';
let key = (await readFile(new URL('../../flow-check/.flowcheck/agent-private-key', import.meta.url), 'utf8')).trim();
if (!key.startsWith('0x')) key = `0x${key}`;
const agent = new Wallet(key);

const session = await sdk.signIn(API, TEAM, agent);
const auth = { headers: { Authorization: `Bearer ${session.token}` } };
const me = await fetch(`${API}/public/participant/me`, auth).then((r) => r.json());
console.log('agent', agent.address);
console.log('me', JSON.stringify(me, null, 1).slice(0, 1500));
console.log('merchants', JSON.stringify(await sdk.listMerchants(API)).slice(0, 600));
console.log('channels', JSON.stringify(await sdk.listChannels(API, session.token)).slice(0, 600));
