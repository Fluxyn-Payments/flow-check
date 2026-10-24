import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';

export const API = process.env.AP4M_API_URL ?? 'https://hackathon.ap4m.build';
export const TEAM = process.env.TEAM_NAME ?? 'Fluxyn';
export const FLOWCHECK_API = process.env.FLOWCHECK_API ?? 'https://yb6cgjetv7itb6r5n2hzb2ukjm0ltowo.lambda-url.us-east-1.on.aws';
export const STATE = new URL('../../flow-check/.flowcheck/', import.meta.url);

export async function network() {
  const config = await (await fetch(`${API}/public/config`)).json();
  return { config, provider: new ethers.JsonRpcProvider(process.env.AP4M_RPC_URL ?? config.network.rpcUrl) };
}

export async function agentWallet(provider) {
  let key = (await readFile(new URL('agent-private-key', STATE), 'utf8')).trim();
  if (!key.startsWith('0x')) key = `0x${key}`;
  return new ethers.Wallet(key, provider);
}

export const explorerTx = (config, hash) => `${config.network.explorerUrl}/tx/${hash}`;
