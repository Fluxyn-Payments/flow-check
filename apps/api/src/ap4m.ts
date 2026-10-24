import { Wallet } from 'ethers';

// Read-only view of the team's Mastercard AP4M state (channels, vouchers, settlements).
// Signs in with the Agent key; never moves funds.
const API = process.env.AP4M_API_URL ?? 'https://hackathon.ap4m.build';
const TEAM = process.env.AP4M_TEAM ?? 'Fluxyn';

export async function ap4mState(agentKey: string | undefined) {
  if (!agentKey) return { enabled: false };
  const wallet = new Wallet(agentKey.startsWith('0x') ? agentKey : `0x${agentKey}`);
  const post = (path: string, body: unknown) => fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const challenge = await post('/public/participant/challenge', { teamName: TEAM, wallet: wallet.address });
  const session = await post('/public/participant/session', { challengeId: challenge.challengeId, signature: await wallet.signMessage(challenge.message) });
  const me = await fetch(`${API}/public/participant/me`, { headers: { Authorization: `Bearer ${session.token}` } }).then((r) => r.json());
  const config = await fetch(`${API}/public/config`).then((r) => r.json());
  const explorer = (tx: string | null) => (tx ? `${config.network.explorerUrl}/tx/${tx}` : null);
  const p = me.paymentState ?? {};
  return {
    enabled: true,
    network: config.network.name,
    team: { name: me.team?.team_name, agent: me.team?.agent_wallet, payout: me.team?.merchant_wallet, merchantId: me.team?.merchant_id },
    budget: { cap: p.allocation_cap, funded: p.vault_funded_amount, status: p.allocation_status },
    channel: p.channel_id ? { id: p.channel_id, cap: p.channel_cap, status: p.channel_status, lastVoucher: p.last_voucher_amount } : null,
    proof: {
      voucherRedeemed: explorer(p.voucher_redeemed_tx),
      claimPaid: explorer(p.claim_paid_tx),
      settlementRecorded: explorer(p.settlement_recorded_tx),
      receipt: p.receipt_available,
    },
    channels: (me.channels ?? []).map((c: any) => ({ id: c.channel_id, status: c.status, cap: c.cap_wei, payout: c.payout, open: explorer(c.request_tx ?? null) })),
    payments: me.payments ?? [],
    contracts: config.contracts,
  };
}

// Proves the channel cap is enforced by the contract: the agent signs a Voucher one RLUSD above the cap and the
// PaymentLedger is asked to redeem it in a dry run (eth_call). Nothing is sent and no funds move.
export async function overCapAttempt(agentKey: string | undefined) {
  if (!agentKey) return { enabled: false };
  const { JsonRpcProvider, Contract, parseUnits, formatUnits } = await import('ethers');
  const config = await fetch(`${API}/public/config`).then((r) => r.json());
  const provider = new JsonRpcProvider(config.network.rpcUrl);
  const wallet = new Wallet(agentKey.startsWith('0x') ? agentKey : `0x${agentKey}`, provider);
  const state: any = await ap4mState(agentKey);
  const channelId = state.channel?.id;
  if (!channelId) return { enabled: true, error: 'no open channel' };
  const ledger = new Contract(config.contracts.paymentLedger, [
    'function redeemVoucher((bytes32 channelId, uint256 cumulativeAmount) voucher, bytes agentSignature) returns (bytes32 claimId, uint256 amount, bytes32 digest)',
    'function channels(bytes32) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)',
  ], wallet);
  const ch = await ledger.channels(channelId);
  const cap = ch[7] as bigint;
  const redeemed = ch[8] as bigint;
  const attempt = cap + parseUnits('1', 18);
  const { chainId } = await provider.getNetwork();
  const signature = await wallet.signTypedData(
    { name: 'AP4M Payment Ledger', version: '1', chainId, verifyingContract: config.contracts.paymentLedger },
    { Voucher: [{ name: 'channelId', type: 'bytes32' }, { name: 'cumulativeAmount', type: 'uint256' }] },
    { channelId, cumulativeAmount: attempt },
  );
  let refused = false;
  let reason = '';
  try {
    await ledger.redeemVoucher.staticCall({ channelId, cumulativeAmount: attempt }, signature);
  } catch (e: any) {
    refused = true;
    reason = e.shortMessage ?? e.message ?? 'reverted';
  }
  return {
    enabled: true, channelId, contract: config.contracts.paymentLedger,
    cap: formatUnits(cap, 18), redeemed: formatUnits(redeemed, 18), attempted: formatUnits(attempt, 18),
    refused, reason, note: 'Dry run against the PaymentLedger (eth_call): nothing was sent.',
  };
}
