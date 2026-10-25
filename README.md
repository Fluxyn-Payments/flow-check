# Fluxyn Flow Check

**Agents can pay. The ledger decides whom.** Know Your Agent, anchored in KYB.

Built at the XRPL Hackathon · New York · October 24–25, 2026 · Track: **Agentic Finance**

- Live demo: https://flowcheck.fluxyn.com
- Demo video: https://youtu.be/xNSXcZMoD1A
- API docs: https://flowcheck.fluxyn.com/api/docs

---

## The problem

AI agents can already pay, but a merchant or a supplier only sees a wallet: not the company behind it, not its budget, not its limits. Before an agent pays, someone has to answer: *who is this agent, who is behind it, and is it allowed to make this payment?*

## How it works

```
SET UP ONCE
  PSP / VASP ──KYB──▶ Business ──signs──▶ Mandate ──anchored──▶ agent DID
       │              (Pass, XLS-70)       limits · categories · budget
       └──attests──▶ AI agent (AGENT_AUTHORIZED, XLS-70) ◀──delegates Payment (XLS-75)── Business

EVERY PAYMENT
  agent asks ──▶ Flow Check reads the ledger ──▶ pay · CFO approves · refuse ──▶ rail
                 attested? delegated? payee has a Pass? inside the Mandate?
```

- A licensed **PSP or VASP** on the Fluxyn network verifies the business and issues its **Pass** (Credential, XLS-70). Fluxyn is the network, not the PSP: issuers from any country.
- The issuer attests each agent with an **`AGENT_AUTHORIZED`** credential that binds it to the business (and to its EVM wallet).
- The business signs a **Mandate** per agent (per-payment, daily, monthly and quarterly limits, allowed categories) and anchors its hash on the agent's **DID**. It **delegates** Payment to the agent (**XLS-75**), so the agent never holds the company key.
- Payees accept only Pass holders (**DepositPreauth with credentials**): an agent that skips our code is refused by the validators (`tecNO_PERMISSION`).
- Over-limit payments wait for the CFO; several approvals settle as one atomic **Batch** (XLS-56).
- The issuer revokes the agent with one `CredentialDelete`; the business can pause it by removing the delegation.

## What runs today

| | What | Status |
|---|---|---|
| **Flow Check SDK** (`packages/flow-check`) | `verifyAgent`, `verifyPass`, `checkMandate`, `payWithPass`, spend tracking from the ledger | Live on XRPL testnet |
| **Agents** (`apps/api`) | Payables and marketing agents running **Claude on Amazon Bedrock**; their only payment tool is Flow Check | Live |
| **XRPL · RLUSD** | Payments to suppliers with a Pass, `tecNO_PERMISSION` for the rest, Batch approvals | Live on testnet |
| **Mastercard Agent Pay** (`packages/rail-ap4m`, `apps/api/src/ap4m.ts`) | Funded channel on XRPL EVM, HTTP 402 merchant, EIP-712 vouchers redeemed on the `PaymentLedger`, settled in RLUSD; the agent pays AP4M merchants from the chat after Flow Check | Live on XRPL EVM testnet |
| **Ripple Payments Direct** (`apps/api/src/ripple.ts`) | Cross-border payout (USD → MXN via SPEI) after Flow Check | **Simulated**: Ripple's public mock server until UAT access |
| **CFO admin** (`apps/web`) | Edit Mandates (new signed version anchored on-chain), pause or restore an agent (XLS-75), rails and channels per agent, team, integrations | Live |
| **Channels** | Web app · embeddable chat widget (`/widget.js`) · REST API (`/api/v1/agent/run`) · per-agent **MCP** server (`/mcp/<agent key>`) and a local MCP (`packages/mcp`) | Live |
| **Ledger approval** (`apps/web/src/ledger.ts`, `apps/api/src/ledger.ts`) | The CFO's Ledger is the business account's regular key; the server builds the payment, the device signs it (XRP app over WebHID) | Built and tested with a stand-in key; **in the demo the approval signature is simulated** and labeled |

Everything is on **XRPL testnet** and **XRPL EVM testnet**. No real funds.

## Repository layout

```
packages/
  flow-check/   SDK (TypeScript, xrpl.js) + testnet setup scripts
  mcp/          MCP server exposing the SDK as tools
  rail-ap4m/    Mastercard AP4M: merchant, payments, channel scripts (XRPL EVM)
apps/
  api/          API on AWS Lambda: agents (Bedrock), Flow Check, AP4M, Ripple, CFO admin, MCP, widget
  web/          Web app (React + Vite) for the five roles, plus widget.js and the demo bank page
```

## Run it

```bash
pnpm install
cp .env.example .env
pnpm --filter @fluxyn/flow-check setup:testnet   # creates the demo accounts and credentials on testnet
pnpm --filter @fluxyn/api dev                    # API on http://localhost:8787
pnpm --filter @fluxyn/web dev                    # web app on http://localhost:5173
```

The Mastercard AP4M SDK is distributed by the hackathon organizers through the participant portal and is not included in this repository; place it in `packages/rail-ap4m/vendor/`.

```ts
import { FlowCheck } from "@fluxyn/flow-check";

const fc = new FlowCheck({ network: "testnet", issuers: ["rIssuer..."] });
await fc.connect();
const kya = await fc.verifyAgent("rAgent...");           // attested, delegated, bound to a business, Mandate
const check = await fc.checkMandate("rAgent...", { destination: "rSupplier...", amount: 1200, currency: "RLUSD" });
// check.decision: ALLOW | NEEDS_APPROVAL | DENY
```

## Prior work (built before the hackathon, not judged)

Per the event rules, only what is built during the 36 hours counts. This existed before October 24, 2026:

- **Fluxyn platform**: company accounts, accounts payable, KYB console for the VASP, network console (https://xrplcommons.fluxyn.com).
- **Fluxyn Pass issuance**: `KYB_VERIFIED` credentials issued on XRPL testnet after KYB approval.
- **Mandate format**: `passport.mandate/v1`, signed by the company and anchored with `DIDSet` on the agent's account.

Everything in this repository was written on October 24–25, 2026; see the commit history.

## Team

- Federico Bais, Fluxyn
- Lengo, engineering
- Lorena, legal and compliance

## License

MIT
