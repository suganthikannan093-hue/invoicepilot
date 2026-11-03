import { describe, it, expect } from "vitest";
import { computeTotals, money, toMinor } from "@/lib/totals";
describe("totals", () => {
  it("sums lines and tax in minor units", () => {
    const t = computeTotals({ currency: "USD", taxPercent: 8, items: [{ name: "a", description: "", quantity: 12, unitPrice: 95, unit: "HOURS" }, { name: "b", description: "", quantity: 1, unitPrice: 400, unit: "AMOUNT" }] });
    expect(t).toEqual({ lines: [1140, 400], subtotal: 1540, tax: 123.2, total: 1663.2 });
  });
  it("avoids float drift", () => {
    const t = computeTotals({ currency: "USD", taxPercent: 0, items: [{ name: "a", description: "", quantity: 3, unitPrice: 0.1, unit: "QUANTITY" }] });
    expect(t.total).toBe(0.3);
    expect(toMinor(1.005, "USD")).toBe(101);
  });
  it("handles zero-decimal currencies", () => {
    expect(money(computeTotals({ currency: "JPY", taxPercent: 10, items: [{ name: "a", description: "", quantity: 1, unitPrice: 1234, unit: "AMOUNT" }] }).total, "JPY")).toBe("1357");
  });
});
