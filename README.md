# Fluxyn Flow Check

**Rails for AI agents that pay, trade and settle — only with counterparties the ledger can verify.**

Built at the AI & Fintech XRP Ledger Hackathon · New York · October 24–25, 2026 · Track: **Agentic Finance**

---

## The problem

AI agents can already move money. What they can't do is answer three questions before every payment:

1. **Who is on the other side?** Is this counterparty a verified business?
2. **Am I allowed to do this?** Is this payment inside the limits my company gave me?
3. **What if they're not on-chain?** How do I pay a supplier who only has a bank account?

## What we built in NYC

One agent, one MCP server, two rails — and **KYA anchored in KYB**: every agent is bound on-ledger to a verified business, with a signed mandate and instant revocation.

```
PSP / VASP ──KYB_VERIFIED──▶ Company ──DelegateSet──▶ Agent account
  └──────AGENT_AUTHORIZED (new)────────────────▶   └─ DID: hash of the signed Mandate
```

| # | Module | What it does | XRPL / partner primitives |
|---|---|---|---|
| 1 | **Flow Check SDK + MCP** (`packages/flow-check`, `packages/mcp`) | **Know Your Agent:** any PSP or VASP on the network issues an `AGENT_AUTHORIZED` credential to the agent's own account, linked to the verified business that delegated it (`verifyAgent`). Plus `verifyPass`, `checkMandate`, `payWithPass` in TypeScript, exposed as MCP tools. An agent running on AWS Bedrock AgentCore pays the month's invoices using only these tools. Over-limit payments wait for a human approval on a Ledger device. | Credentials (XLS-70), DepositPreauth, Permission Delegation (XLS-75), DID, Batch · Bedrock AgentCore · Ledger |
| 2 | **Mastercard AP4M** (`packages/rail-ap4m`) | Fluxyn is **attestation infrastructure, not the PSP**: the agent's own PSP or VASP issues its XRPL credentials (Fluxyn Pass + `AGENT_AUTHORIZED`) through the Fluxyn network, and those credentials back its registration in AP4M's `ParticipantRegistry`. Fluxyn is also a merchant: Flow Check verifications are sold behind **HTTP 402**, and the agent pays them with EIP-712 vouchers inside a funded channel cap, settled in RLUSD on XRPL EVM. Over-cap attempts are rejected by the contract. | Mastercard AP4M (`ParticipantRegistry`, `PaymentLedger`, `PooledEscrowVault`) · x402 · RLUSD · XRPL EVM |
| 3 | **Permissioned DEX treasury** — *stretch goal, only if time allows* | The same agent converts treasury balances on the Permissioned DEX — it can only cross offers from accounts holding a Fluxyn Pass, inside the domain and within its Mandate limits. | PermissionedDomains, PermissionedDEX, OfferCreate with `DomainID` |

Everything is visible live on a monitor that listens to both XRPL and XRPL EVM through **Quicknode** (`apps/monitor`).

**Two chains, one identity.** The business and the agent are verified once, on the XRP Ledger. That same identity is what lets the agent open a funded AP4M channel on XRPL EVM. Limits apply in two layers: the signed Mandate (enforced by Fluxyn) and the funded channel cap (enforced by the AP4M contract). The agent's payment key is separate from the funding wallet.

### The demo

| Case | What happens | Result |
|---|---|---|
| Supplier with Pass | Paid on-chain in RLUSD, within the Mandate | `tesSUCCESS` |
| Payment over the limit | Agent proposes, CFO approves on a Ledger device, then it settles | ✓ after approval |
| Supplier without Pass | Rejected by the validators — nothing moves | `tecNO_PERMISSION` |
| Agent buys a verification | HTTP 402 → agent-signed voucher → Flow Check result released → `VoucherRedeemed`, `ClaimPaid`, `SettlementRecorded` | ✓ AP4M receipt (channel + claim + payout) |
| Agent tries to exceed its channel cap | Voucher above the funded cap | ✗ rejected by `PaymentLedger` |

## Quickstart

```bash
pnpm install
cp .env.example .env   # XRPL testnet, Quicknode, AWS, Mastercard
pnpm dev
```

```ts
import { FlowCheck } from "@fluxyn/flow-check";

const fc = new FlowCheck({ network: "testnet" });
await fc.payWithPass({ to: "rSupplier...", amount: "1200", currency: "RLUSD" });
```

## Repository layout

```
packages/
  flow-check/       SDK: verifyPass, checkMandate, payWithPass
  mcp/              MCP server exposing the SDK as tools
  rail-ap4m/        AP4M: PSP attestation, x402 merchant, vouchers (XRPL EVM)
agent/              Claude on Bedrock AgentCore
apps/monitor/       Live ledger monitor (Quicknode)
```

## Prior work (built before the hackathon, not judged)

Per the event rules, only what is built during the 36 hours counts. This is what existed before October 24, 2026:

- **Fluxyn platform** — company accounts, accounts payable, KYB review console for the VASP, network console.
- **Fluxyn Pass issuance** — `KYB_VERIFIED` credentials issued on XRPL testnet after KYB approval.
- **Mandate** — `passport.mandate/v1` document signed by the company and anchored with `DIDSet` on the agent's account.

Public demo of the prior work: https://xrplcommons.fluxyn.com

Everything in this repository was written on October 24–25, 2026 — see the commit history.

## Team

- Federico Bais — Fluxyn (NYC)
- Lengo — (NYC)
- Lorena — legal & compliance, EquipoLega (NYC)
- Jhony + builders — remote

## License

MIT
