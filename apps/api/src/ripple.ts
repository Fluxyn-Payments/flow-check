// Ripple Payments Direct 2.0 rail: a cross-border fiat payout, only after Flow Check clears the agent,
// the supplier's Pass and the Mandate. Without UAT credentials it runs against Ripple's official mock
// server (published with the API docs) and every result is labeled as simulated.
const MOCK = 'https://docs.ripple.com/_mock/products/payments-direct-2/api-docs/payments-direct-api/payments-direct-2-api';

export type FiatBeneficiary = {
  name: string; country: string; currency: string; rail: 'MX_SPEI'; clabe: string; bankName: string; email: string; phone: string;
  address: { streetAddress: string[]; city: string; stateOrProvince: string; postalCode: string; country: string };
};

const live = () => !!(process.env.RIPPLE_CLIENT_ID && process.env.RIPPLE_CLIENT_SECRET && process.env.RIPPLE_TENANT_ID);
const base = () => (live() ? process.env.RIPPLE_BASE_URL ?? 'https://api.test.ripple.com' : MOCK);

let token: { value: string; until: number } | null = null;
async function auth(): Promise<Record<string, string>> {
  // The mock accepts any bearer token
  if (!live()) return { authorization: 'Bearer flowcheck-mock' };
  if (!token || token.until < Date.now() + 300_000) {
    const r = await fetch(`${base()}/v2/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.RIPPLE_CLIENT_ID, client_secret: process.env.RIPPLE_CLIENT_SECRET, audience: `urn:ripplexcurrent-uat:${process.env.RIPPLE_TENANT_ID}`, grant_type: 'client_credentials' }),
    });
    const t: any = await r.json();
    if (!r.ok) throw new Error(`Ripple auth failed (${r.status})`);
    token = { value: t.access_token, until: Date.now() + t.expires_in * 1000 };
  }
  return { authorization: `Bearer ${token.value}` };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${base()}${path}`, { method, headers: { 'content-type': 'application/json', ...(await auth()) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Ripple ${method} ${path}: ${r.status} ${data.title ?? data.message ?? ''}`.trim());
  return data as T;
}

// Beneficiary + bank account, quote USD → local currency, then the payment with the invoice as a label
export async function payoutViaRipple(b: FiatBeneficiary, amountUsd: number, invoice: string) {
  const identity = await call<{ identityId: string }>('POST', '/v3/identities', {
    identityType: 'BUSINESS', paymentRole: 'BENEFICIARY', nickName: b.name,
    business: { businessName: b.name, incorporationCountry: b.country, email: b.email, phone: b.phone, address: b.address }, validatePayoutRails: [b.rail],
  });
  const instrument = await call<{ financialInstrumentId: string }>('POST', `/v3/identities/${identity.identityId}/financial-instruments`, {
    financialInstrumentType: b.rail, currency: b.currency, mxSpei: { bankName: b.bankName, clabe: b.clabe },
  });
  const quotes = await call<{ quotes: { quoteId: string; sourceAmount: number; destinationAmount: number; paymentRail: string; adjustedExchangeRate?: { adjustedRate: number }; fees?: { totalFee: number }[]; expiresAt: string }[] }>('POST', '/v3/quotes/quote-collection', {
    quoteAmount: amountUsd, quoteAmountType: 'SOURCE_AMOUNT', sourceCurrency: 'USD', destinationCurrency: b.currency,
    payinCategory: 'PRE_FUNDING', destinationCountry: b.country, paymentRail: 'SPEI',
  });
  const quote = quotes.quotes[0];
  const payment = await call<{ paymentId: string; paymentState?: string; initiatedAt?: string }>('POST', '/v3/payments', {
    quoteId: quote.quoteId, beneficiaryIdentityId: identity.identityId, beneficiaryFinancialInstrumentId: instrument.financialInstrumentId,
    receiverRelationship: 'SUPPLIER', paymentLabels: [`invoiceNumber=${invoice}`],
  });
  return {
    simulated: !live(),
    rail: 'Ripple Payments Direct',
    paymentId: payment.paymentId,
    paymentState: payment.paymentState ?? 'INITIATED',
    requested: { amount: amountUsd, currency: 'USD', to: b.currency, rail: 'SPEI' },
    // The mock answers with fixed example values, so its quote is not shown as ours
    quote: live() ? { sourceAmount: quote.sourceAmount, sourceCurrency: 'USD', destinationAmount: quote.destinationAmount, destinationCurrency: b.currency, rate: quote.adjustedExchangeRate?.adjustedRate ?? null, fee: quote.fees?.[0]?.totalFee ?? null, paymentRail: quote.paymentRail } : null,
    note: live() ? null : 'Ripple mock server: the flow is real, the returned values are fixed examples',
  };
}
