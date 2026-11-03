import { describe, it, expect } from "vitest";
import { mockParse, normalise } from "@/lib/llm";
import { InvoiceDraftSchema } from "@/lib/schema";
import { toPayPalInvoice } from "@/lib/paypal/payload";
const today = new Date("2026-11-03T00:00:00Z");
describe("mock parser + normalise", () => {
  it("extracts hours, rate, flat fee, tax, terms", () => {
    const { raw } = mockParse("Invoice Acme Robotics (billing@acme.com) for 12 hours at $95/hour plus a logo refresh for $400. 8% tax, net 15.", today);
    const { draft, issues } = normalise(raw, today);
    expect(issues).toEqual([]);
    expect(draft.clientEmail).toBe("billing@acme.com");
    expect(draft.items[0]).toMatchObject({ quantity: 12, unitPrice: 95, unit: "HOURS" });
    expect(draft.items.some((i) => i.unitPrice === 400)).toBe(true);
    expect(draft.taxPercent).toBe(8);
    expect(draft.dueDate).toBe("2026-11-18");
  });
  it("keeps invalid drafts but reports issues (missing email)", () => {
    const { draft, issues } = normalise({ clientName: "Bob", clientEmail: "", currency: "usd", items: [{ name: "x", quantity: 1, unitPrice: 5 }], dueDate: "soon" }, today);
    expect(draft.currency).toBe("USD");
    expect(draft.dueDate).toBe("2026-12-03");
    expect(issues.some((i) => i.startsWith("clientEmail"))).toBe(true);
  });
  it("schema rejects negatives and empty items", () => {
    const base = { clientName: "A", clientEmail: "a@b.co", currency: "USD", taxPercent: 0, dueDate: "2026-12-01", notes: "" };
    expect(InvoiceDraftSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(InvoiceDraftSchema.safeParse({ ...base, items: [{ name: "x", quantity: 1, unitPrice: -1 }] }).success).toBe(false);
    expect(InvoiceDraftSchema.safeParse({ ...base, currency: "XYZ", items: [{ name: "x", quantity: 1, unitPrice: 1 }] }).success).toBe(false);
  });
  it("maps to PayPal Invoicing v2 body", () => {
    const b = toPayPalInvoice({ clientName: "Lena Fischer", clientEmail: "l@n.de", currency: "EUR", taxPercent: 19, dueDate: "2026-12-01", notes: "Danke", items: [{ name: "Copy", description: "", quantity: 1, unitPrice: 650, unit: "AMOUNT" }] }, today);
    expect(b.detail.payment_term.due_date).toBe("2026-12-01");
    expect(b.primary_recipients[0].billing_info.name).toEqual({ given_name: "Lena", surname: "Fischer" });
    expect(b.items[0]).toMatchObject({ quantity: "1", unit_amount: { currency_code: "EUR", value: "650.00" }, tax: { percent: "19" } });
  });
});
