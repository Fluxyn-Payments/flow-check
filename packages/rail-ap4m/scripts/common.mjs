import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';

export const API = process.env.AP4M_API_URL ?? 'https://hackathon.ap4m.build';
export const TEAM = process.env.TEAM_NAME ?? 'Fluxyn';
export const FLOWCHECK_API = process.env.FLOWCHECK_API ?? 'https://f65haq6h5jdpzx42ixfoxqrvvu0szjsk.lambda-url.us-east-1.on.aws';
export const STATE = process.env.STATE_DIR ? new URL(`file://${process.env.STATE_DIR.replace(/\/?$/, '/')}`) : new URL('../../flow-check/.flowcheck/', import.meta.url);

export async function network() {
  const config = await (await fetch(`${API}/public/config`)).json();
  return { config, provider: new ethers.JsonRpcProvider(process.env.AP4M_RPC_URL ?? config.network.rpcUrl) };
}

export async function agentWallet(provider) {
  // On a server the key comes from the environment (loaded from Secrets Manager); locally from .flowcheck/
  let key = (process.env.AGENT_PRIVATE_KEY ?? (await readFile(new URL('agent-private-key', STATE), 'utf8'))).trim();
  if (!key.startsWith('0x')) key = `0x${key}`;
  return new ethers.Wallet(key, provider);
}

export const explorerTx = (config, hash) => `${config.network.explorerUrl}/tx/${hash}`;
