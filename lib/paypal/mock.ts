import type { PayPalGateway } from "./types";
import { tx } from "../store";

/** Clearly-labelled mock PayPal. Status moves DRAFT → SENT → (simulated) PAID on a later refresh. */
type M = { status: string; checks: number };
const key = "__mockPaypal";
function state(): Promise<Record<string, M>> {
  return tx((db) => ((db as unknown as Record<string, Record<string, M>>)[key] ??= {}));
}
function update(id: string, f: (m: M) => void) {
  return tx((db) => { const s = ((db as unknown as Record<string, Record<string, M>>)[key] ??= {}); f((s[id] ??= { status: "DRAFT", checks: 0 })); });
}
export const mockGateway: PayPalGateway = {
  mode: "mock",
  async createDraft() {
    const id = "INV2-MOCK-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Date.now().toString(36).toUpperCase().slice(-4);
    await update(id, (m) => { m.status = "DRAFT"; });
    return { invoiceId: id, status: "DRAFT", payerViewUrl: undefined };
  },
  async send(id) { await update(id, (m) => { m.status = "SENT"; }); return { invoiceId: id, status: "SENT" }; },
  async getStatus(id) {
    await update(id, (m) => { m.checks++; if (m.status === "SENT" && process.env.MOCK_PAYPAL_AUTOPAY === "true" && m.checks >= 3) m.status = "PAID"; });
    const s = await state();
    return { invoiceId: id, status: s[id]?.status ?? "DRAFT" };
  },
  async remind() {},
};
