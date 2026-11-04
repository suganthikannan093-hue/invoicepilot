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

/** Map a PayPal Invoicing v2 invoice back to our draft shape (inverse of toPayPalInvoice). */
export function fromPayPalInvoice(inv: import("./rest").PayPalFullInvoice): InvoiceDraft {
  const b = inv.primary_recipients?.[0]?.billing_info;
  const name = b?.name?.full_name || [b?.name?.given_name, b?.name?.surname].filter(Boolean).join(" ") || "PayPal customer";
  const units = ["HOURS", "QUANTITY", "AMOUNT"] as const;
  const items = (inv.items ?? []).map((i) => ({
    name: i.name, description: i.description ?? "", quantity: Number(i.quantity ?? 1) || 1,
    unitPrice: Number(i.unit_amount?.value ?? 0),
    unit: (units as readonly string[]).includes(i.unit_of_measure ?? "") ? (i.unit_of_measure as (typeof units)[number]) : "QUANTITY",
  }));
  return {
    clientName: name, clientEmail: b?.email_address ?? "",
    currency: (inv.detail?.currency_code ?? "USD") as InvoiceDraft["currency"],
    items: items.length ? items : [{ name: "Invoice total", description: "", quantity: 1, unitPrice: 0, unit: "AMOUNT" }],
    taxPercent: Number(inv.items?.[0]?.tax?.percent ?? 0), dueDate: inv.detail?.payment_term?.due_date ?? new Date().toISOString().slice(0, 10),
    notes: inv.detail?.note ?? "",
  };
}
