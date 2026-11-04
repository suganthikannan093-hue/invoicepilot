import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import type { PayPalGateway, PayPalInvoiceRef } from "./types";
import { restGateway } from "./rest";

/**
 * PayPal Agent Toolkit adapter. Status checks, sending and reminders are executed through the
 * official toolkit's invoice tools (get_invoice, send_invoice, send_invoice_reminder), invoked
 * server-side only after the approval guard passes. Creation uses the REST client because our
 * draft carries a payment_term due date that the toolkit's flat create params don't expose.
 */
let tk: PayPalAgentToolkit | null = null;
const toolkit = () => (tk ??= new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!, clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: { actions: { invoices: { get: true, send: true, sendReminder: true, list: true } }, context: { sandbox: true } },
}));

async function run(name: string, args: Record<string, unknown>): Promise<unknown> {
  const out = await toolkit().handleToolCall({ id: "call_" + crypto.randomUUID(), type: "function", function: { name, arguments: JSON.stringify(args) } } as never);
  const c = typeof out.content === "string" ? out.content : JSON.stringify(out.content);
  try { return JSON.parse(c); } catch { return c; }
}

export const toolkitGateway: PayPalGateway = {
  mode: "sandbox-agent-toolkit",
  createDraft: (b) => restGateway.createDraft(b),
  async send(id) {
    const out = await run("send_invoice", { invoice_id: id, send_to_recipient: true });
    const st = await this.getStatus(id);
    // The toolkit returns PayPal errors as tool output instead of throwing; never report a failed send as success.
    if (st.status === "DRAFT") {
      const msg = typeof out === "string" ? out : JSON.stringify(out);
      throw new Error(`PayPal send_invoice via Agent Toolkit did not send ${id}: ${msg.slice(0, 400)}`);
    }
    return st;
  },
  async getStatus(id): Promise<PayPalInvoiceRef> {
    const r = (await run("get_invoice", { invoice_id: id })) as { id?: string; status?: string; detail?: { metadata?: { recipient_view_url?: string } } };
    if (!r || typeof r !== "object" || !r.status) return restGateway.getStatus(id);
    return { invoiceId: r.id ?? id, status: r.status, payerViewUrl: r.detail?.metadata?.recipient_view_url };
  },
  async remind(id, subject, note) { await run("send_invoice_reminder", { invoice_id: id, subject, note }); },
};
