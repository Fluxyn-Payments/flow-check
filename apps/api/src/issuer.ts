import { Wallet, type SubmittableTransaction } from 'xrpl';
import { agentBinding, toHex, type FlowCheck } from '@fluxyn/flow-check';
import type { State } from './app.js';

const RIPPLE_EPOCH = 946684800;
const TYPE = toHex('AGENT_AUTHORIZED');

async function submit(fc: FlowCheck, tx: SubmittableTransaction, wallet: Wallet) {
  const res = await fc.client.submitAndWait(tx, { wallet, autofill: true });
  const engineResult = (res.result.meta as any)?.TransactionResult as string;
  return { engineResult, hash: res.result.hash, explorer: fc.txUrl(res.result.hash) };
}

// The issuer revokes the agent's attestation. Flow Check stops authorizing it at once.
export async function revokeAgent(fc: FlowCheck, s: State, agent: string) {
  const issuer = Wallet.fromSeed(s.issuers.vasp.seed);
  return submit(fc, { TransactionType: 'CredentialDelete', Account: issuer.address, Subject: agent, CredentialType: TYPE } as any, issuer);
}

// The issuer attests the demo agent again: bound to its business and EVM wallet, expiring with the Mandate.
export async function attestAgent(fc: FlowCheck, s: State) {
  const issuer = Wallet.fromSeed(s.issuers.vasp.seed);
  const agent = Wallet.fromSeed(s.agent.seed);
  const mandate = s.mandates[s.mandateHash]?.mandate;
  const current = (await fc.credentials(agent.address)).find((c) => c.type === 'AGENT_AUTHORIZED' && c.issuer === issuer.address);
  if (current) return { engineResult: 'already attested', hash: null, explorer: null };
  const evm = s.ap4m?.agentKey ? (await import('ethers')).computeAddress(s.ap4m.agentKey.startsWith('0x') ? s.ap4m.agentKey : `0x${s.ap4m.agentKey}`) : null;
  const uri = `flowcheck:agent:principal:${s.business.address}${evm ? `:evm:${evm}` : ''}`;
  const expiration = mandate ? Math.floor(new Date(mandate.validUntil).getTime() / 1000) - RIPPLE_EPOCH : undefined;
  const created = await submit(fc, { TransactionType: 'CredentialCreate', Account: issuer.address, Subject: agent.address, CredentialType: TYPE, URI: toHex(uri), Expiration: expiration } as any, issuer);
  if (created.engineResult !== 'tesSUCCESS') return created;
  return submit(fc, { TransactionType: 'CredentialAccept', Account: agent.address, Issuer: issuer.address, CredentialType: TYPE } as any, agent);
}

// What the issuer sees: the businesses it verified and the agents it attested, read from the ledger
export async function issuerView(fc: FlowCheck, s: State) {
  const issuer = s.issuers.vasp.address;
  const r: any = await fc.client.request({ command: 'account_objects', account: issuer, type: 'credential' } as any);
  const issued = r.result.account_objects
    .filter((o: any) => o.Issuer === issuer)
    .map((o: any) => {
      const type = Buffer.from(o.CredentialType, 'hex').toString();
      const uri = o.URI ? Buffer.from(o.URI, 'hex').toString() : null;
      return {
        subject: o.Subject, type, accepted: (o.Flags & 0x00010000) !== 0,
        expires: o.Expiration ? new Date((o.Expiration + RIPPLE_EPOCH) * 1000).toISOString() : null,
        binding: type === 'AGENT_AUTHORIZED' ? agentBinding(uri) : null,
      };
    });
  return { issuer: { address: issuer, name: 'Demo VASP · NYC', type: 'VASP' }, demoAgent: s.agent.address, demoBusiness: s.business.address, issued };
}
