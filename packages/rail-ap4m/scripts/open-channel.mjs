// Opens a fresh AP4M Channel from the team budget (for example before a demo). Usage: node scripts/open-channel.mjs [capRlusd]
import sdk from '../vendor/ap4m-hackathon-sdk.cjs';
import { API, TEAM, network, agentWallet } from './common.mjs';

const { config, provider } = await network();
const agent = await agentWallet(provider);
const { token } = await sdk.signIn(API, TEAM, agent);
const me = await (await fetch(`${API}/public/participant/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
const channel = await sdk.requestChannel(API, token, agent, { capRlusd: process.argv[2] ?? '5', merchantId: me.team.merchant_id, rpcUrl: config.network.rpcUrl });
console.log(`[AP4M] channel ${channel.channel_id} ${channel.channel_status} · cap ${process.argv[2] ?? '5'} RLUSD`);
