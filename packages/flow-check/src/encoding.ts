import { createHash } from 'node:crypto';

export const toHex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
export const fromHex = (h: string) => Buffer.from(h, 'hex').toString('utf8');

// Currency codes longer than 3 characters go on the ledger as 40 hex characters
export const currencyCode = (code: string) => (code.length === 3 ? code : toHex(code).padEnd(40, '0'));

// Canonical JSON: sorted keys, no whitespace, undefined dropped. Same hash in any language.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase();
