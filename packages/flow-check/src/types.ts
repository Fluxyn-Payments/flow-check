export type Level = 'OFF' | 'VIEW' | 'PREPARE' | 'EXECUTE';

export type Mandate = {
  schema: 'passport.mandate/v1';
  network: string;
  version: number;
  agent: string;
  principal: string;
  credential: { issuer: string; type: string };
  enabled: boolean;
  permissions: { pay: Level; collect: Level; treasury: Level };
  limits: { currency: 'USD'; perPayment: number; daily: number; monthly: number; quarterly?: number };
  /** Spending categories this agent may pay (for example from the ERP). Absent = any category. */
  categories?: string[];
  rules: { category?: string; counterparty?: string; approval: 'AUTO' | 'ASK'; maxUsd?: number }[];
  counterparties: { onchain: 'PASSPORT_NETWORK' };
  issuedAt: string;
  validUntil: string;
};

// The Mandate as published: the document, the business's signature over its hash, and the signing key
export type SignedMandate = { mandate: Mandate; signature: string; publicKey: string };

export type CredentialType = 'KYB_BASIC' | 'KYB_VERIFIED' | 'AGENT_AUTHORIZED';

export type CredentialInfo = {
  issuer: string;
  type: CredentialType;
  accepted: boolean;
  expired: boolean;
  index: string;
  uri: string | null;
};

export type Check = { id: string; label: string; ok: boolean; effect: 'DENY' | 'APPROVAL'; detail: string };

export type Decision = 'ALLOW' | 'NEEDS_APPROVAL' | 'DENY';

export type PassResult = { verified: boolean; account: string; tier: CredentialType | null; credential: CredentialInfo | null };

export type AgentResult = {
  authorized: boolean;
  agent: string;
  principal: string | null;
  issuer: string | null;
  mandateHash: string | null;
  /** The agent's XRPL EVM address, when its credential binds one (used for Mastercard AP4M). */
  evm: string | null;
  checks: Check[];
};

export type PaymentRequest = { amount: number; currency: string; destination: string; category?: string };

// What the agent already spent, in USD. Flow Check does not keep state; the caller passes it.
export type Usage = { today: number; month: number; quarter?: number };

// The business's current Mandates, one per agent. Its hash is anchored on the business account (DIDSet),
// so a business with several agents can say which Mandate is in force for each one.
export type MandateSet = { schema: 'flowcheck.mandate-set/v1'; principal: string; agents: Record<string, string>; issuedAt: string };

export type MandateResult = {
  decision: Decision;
  agent: string;
  mandate: Mandate | null;
  mandateHash: string | null;
  request: PaymentRequest;
  usd: number;
  checks: Check[];
};
