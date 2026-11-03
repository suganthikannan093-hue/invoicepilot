import type { InvoiceDraft } from "../schema";
import { money } from "../totals";

/** Map our draft to a PayPal Invoicing v2 create-invoice body. */
export function toPayPalInvoice(d: InvoiceDraft, today = new Date()) {
  const [given, ...rest] = d.clientName.trim().split(/\s+/);
  return {
    detail: {
      currency_code: d.currency,
      invoice_date: today.toISOString().slice(0, 10),
      note: d.notes || undefined,
      payment_term: { due_date: d.dueDate },
    },
    primary_recipients: [{ billing_info: { name: { given_name: given, surname: rest.join(" ") || undefined }, email_address: d.clientEmail } }],
    items: d.items.map((i) => ({
      name: i.name.slice(0, 200),
      description: i.description || undefined,
      quantity: String(i.quantity),
      unit_amount: { currency_code: d.currency, value: money(i.unitPrice, d.currency) },
      unit_of_measure: i.unit,
      ...(d.taxPercent > 0 ? { tax: { name: "Tax", percent: String(d.taxPercent) } } : {}),
    })),
    configuration: { allow_tip: false, tax_calculated_after_discount: true, tax_inclusive: false },
  };
}
