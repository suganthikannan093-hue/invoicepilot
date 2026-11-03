import type { InvoiceDraft } from "./schema";

const ZERO_DECIMAL = new Set(["JPY"]);
export const decimals = (c: string) => (ZERO_DECIMAL.has(c) ? 0 : 2);

/** Round half-up in minor units to avoid float drift. */
export function toMinor(amount: number, currency: string): number {
  const f = 10 ** decimals(currency);
  return Math.round((amount + Number.EPSILON) * f);
}
export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** decimals(currency);
}

export interface Totals { lines: number[]; subtotal: number; tax: number; total: number }

export function computeTotals(d: Pick<InvoiceDraft, "items" | "taxPercent" | "currency">): Totals {
  const lines = d.items.map((i) => toMinor(i.quantity * i.unitPrice, d.currency));
  const sub = lines.reduce((a, b) => a + b, 0);
  const tax = Math.round((sub * (d.taxPercent || 0)) / 100);
  return {
    lines: lines.map((l) => fromMinor(l, d.currency)),
    subtotal: fromMinor(sub, d.currency),
    tax: fromMinor(tax, d.currency),
    total: fromMinor(sub + tax, d.currency),
  };
}

export function money(n: number, currency: string): string {
  return n.toFixed(decimals(currency));
}
