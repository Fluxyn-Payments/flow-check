import type { State } from './app.js';

// Public profiles of the network's participants: what the issuer agrees to show about a business and its agents.
// The ledger only holds accounts and credentials; names and descriptions live here. All demo entities are fictional.
export type Profile = { name: string; kind: 'business' | 'agent'; tag?: string; description: string; source: 'nyc' | 'prior' };

const PRIOR: Record<string, Profile> = {
  rMj8M8oYxsG73up7CejDRGYFkkUrBJg6S3: { name: 'Startup SAS', kind: 'business', description: 'Software startup in the Fluxyn business app', source: 'prior' },
  rfZdzPSHBPkaacSBpAvbcqmuBran5ET4a9: { name: 'Startup SAS · payables agent', kind: 'agent', tag: 'Payables', description: 'Pays supplier invoices from the business app, under a signed Mandate', source: 'prior' },
  ram3vVheytY1PS74GLBFUaar2XB22JbhED: { name: 'Nubo Labs SAS', kind: 'business', description: 'Cloud services company in the Fluxyn business app', source: 'prior' },
  r9cbckUtN5Eu9HggbiL1QvLeEhkoX56TWR: { name: 'Nubo Labs SAS · agent', kind: 'agent', tag: 'Payables', description: 'Delegated to pay, no Mandate published yet', source: 'prior' },
  rfEGD26vdug2GxGiFqUDqVLVJ8Jt74drHo: { name: 'Empresa demo BR Ltda', kind: 'business', description: 'Brazilian business verified by a VASP in Brazil', source: 'prior' },
  rfkgvQBbywUTD5JRGv9cSKPsPGFrKeNUKP: { name: 'Empresa demo BR Ltda · agent', kind: 'agent', tag: 'Payables', description: 'Delegated to pay, no Mandate published yet', source: 'prior' },
  rGrL8Jei5eCM1XDb5Ks22oW22RAio7dH6B: { name: 'Comercio demo PSP SRL', kind: 'business', description: 'Merchant verified by a payment institution (Pass Basic)', source: 'prior' },
  rM61JECCZ1QkyeNgefAv7KWPcfUCuU1zXh: { name: 'Comercio demo PSP SRL · agent', kind: 'agent', tag: 'Collections', description: 'Delegated to pay, no Mandate published yet', source: 'prior' },
};

export function profiles(s: State): Record<string, Profile> {
  return {
    ...PRIOR,
    [s.business.address]: { name: 'Lumen Robotics Inc.', kind: 'business', description: 'Hardware company paying its monthly suppliers through its agent', source: 'nyc' },
    [s.agent.address]: { name: 'Lumen Robotics · payables agent', kind: 'agent', tag: 'Payables', description: "Pays the month's supplier invoices inside its Mandate and buys verification reports through Mastercard AP4M", source: 'nyc' },
    [s.suppliers.a.address]: { name: 'Stratus Cloud LLC', kind: 'business', description: 'Cloud provider, supplier of Lumen Robotics', source: 'nyc' },
    [s.suppliers.b.address]: { name: 'Atelier Norte Studio', kind: 'business', description: 'Design studio, supplier of Lumen Robotics', source: 'nyc' },
    [s.vendor.address]: { name: 'New vendor (unverified)', kind: 'business', description: 'No Pass: Flow Check does not pay it', source: 'nyc' },
    ...(s.agents?.marketing ? { [s.agents.marketing.address]: { name: 'Lumen Robotics · marketing agent', kind: 'agent' as const, tag: 'Marketing', description: 'Pays design, ads and events within a quarterly budget; operated by the marketing team', source: 'nyc' as const } } : {}),
    [s.rogue.address]: { name: 'Unknown agent', kind: 'agent', tag: 'No KYA', description: 'An agent without attestation; the ledger refuses its payments', source: 'nyc' },
  };
}
