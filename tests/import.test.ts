import { describe, it, expect } from "vitest";
import { fromPayPalInvoice, toPayPalInvoice } from "../lib/paypal/payload";
import { InvoiceDraftSchema } from "../lib/schema";

describe("fromPayPalInvoice", () => {
  it("round-trips a draft through the PayPal Invoicing v2 shape", () => {
    const d = InvoiceDraftSchema.parse({ clientName: "Alex Rivera", clientEmail: "alex@example.com", currency: "USD", taxPercent: 8, dueDate: "2026-11-20", notes: "Thanks",
      items: [{ name: "React fixes", quantity: 6, unitPrice: 40, unit: "HOURS" }, { name: "Deploy setup", quantity: 1, unitPrice: 60, unit: "AMOUNT" }] });
    const body = toPayPalInvoice(d);
    const back = fromPayPalInvoice({ id: "INV2-AAAA-BBBB", status: "SENT", ...body } as never);
    expect(back).toMatchObject({ clientName: "Alex Rivera", clientEmail: "alex@example.com", currency: "USD", taxPercent: 8, dueDate: "2026-11-20", notes: "Thanks" });
    expect(back.items.map((i) => [i.name, i.quantity, i.unitPrice, i.unit])).toEqual([["React fixes", 6, 40, "HOURS"], ["Deploy setup", 1, 60, "AMOUNT"]]);
    expect(InvoiceDraftSchema.safeParse(back).success).toBe(true);
  });
  it("falls back safely on sparse invoices", () => {
    const back = fromPayPalInvoice({ id: "INV2-X", status: "PAID" } as never);
    expect(back.clientName).toBe("PayPal customer");
    expect(back.items).toHaveLength(1);
  });
});
