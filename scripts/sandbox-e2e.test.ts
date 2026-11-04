// Manual real-sandbox e2e: run with `RUN_SANDBOX_E2E=1 npx vitest run scripts/sandbox-e2e.test.ts`
// Note: India-registered sandbox merchants cannot invoice India-based buyers (INR_FOREIGN_CURRENCY_BLOCKED), so the default buyer is a non-PayPal international address.
import { describe, it, expect } from "vitest";
import { getAccessToken } from "../lib/paypal/rest";
import { restGateway } from "../lib/paypal/rest";
import { toolkitGateway } from "../lib/paypal/toolkit";
import { toPayPalInvoice } from "../lib/paypal/payload";

const on = process.env.RUN_SANDBOX_E2E === "1" && process.env.PAYPAL_CLIENT_ID;
const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
const draft = (tag: string) => toPayPalInvoice({ clientName: "Sandbox Buyer", clientEmail: process.env.E2E_BUYER ?? "intl-client@example.com", currency: "USD", items: [{ name: `InvoicePilot e2e ${tag}`, description: "", quantity: 2, unitPrice: 25, unit: "HOURS" }], taxPercent: 0, dueDate: due, notes: "Sandbox test" });

describe.skipIf(!on)("PayPal sandbox e2e", () => {
  it("oauth", async () => { expect((await getAccessToken()).length).toBeGreaterThan(10); });
  for (const [name, gw] of [["rest", restGateway], ["toolkit", toolkitGateway]] as const) {
    it(`${name}: create → send → status`, async () => {
      const c = await gw.createDraft(draft(name));
      console.log(name, "created", c.invoiceId, c.status);
      expect(c.status).toBe("DRAFT");
      const s = await gw.send(c.invoiceId);
      console.log(name, "after send", s.invoiceId, s.status, s.payerViewUrl ?? "");
      const g = await gw.getStatus(c.invoiceId);
      console.log(name, "status", g.status);
      expect(["SENT", "UNPAID"]).toContain(g.status);
    }, 60000);
  }
});
