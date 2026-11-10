import { tx, read, audit, getPurchase, newPurchaseId, now, type PurchaseRecord, type PurchaseKind } from "../store";
import { planPurchase } from "./plan";
import { detectInjection, evaluateSpend } from "../policy/engine";
import { getOrInitPolicy, dailySpentOn } from "../policy/service";
import { issueSpendApproval, consumeSpendApproval, purchaseContentHash, ApprovalError } from "../approval";
import { ordersGateway } from "../paypal/orders";
import { computeTotals } from "../totals";
import type { Category } from "../policy/schema";

export function purchaseView(rec: PurchaseRecord) {
  return { ...rec, hash: purchaseContentHash(rec) };
}

const must = (r: PurchaseRecord | undefined) => { if (!r) throw new ApprovalError("Purchase not found", 404); return r; };

async function recordProposed(opts: {
  prompt: string;
  untrustedContext?: string;
  plan: { item: string; merchant: string; amount: number; currency: string; category: Category; quantity: number; assumptions: string[] };
  source: "openai" | "mock";
  kind: PurchaseKind;
  invoiceNotes?: string;
  sourceInvoiceId?: string;
  sourceDraftId?: string;
}) {
  const policyRec = await getOrInitPolicy();
  const injection = detectInjection(`${opts.prompt}\n${opts.untrustedContext ?? ""}\n${opts.invoiceNotes ?? ""}`);
  return tx((db) => {
    const dailySpent = dailySpentOn(db.purchases);
    const decision = evaluateSpend({
      policy: policyRec.compiled,
      purchase: { amount: opts.plan.amount, currency: opts.plan.currency, category: opts.plan.category, merchant: opts.plan.merchant },
      dailySpent,
      injectionDetected: injection.detected,
    });
    const rec: PurchaseRecord = {
      id: newPurchaseId(),
      prompt: opts.prompt,
      untrustedContext: opts.untrustedContext || undefined,
      injectionDetected: injection.detected,
      injectionSignals: injection.signals,
      item: opts.plan.item,
      merchant: opts.plan.merchant,
      amount: opts.plan.amount,
      currency: opts.plan.currency,
      category: opts.plan.category,
      quantity: opts.plan.quantity,
      source: opts.source,
      kind: opts.kind,
      invoiceNotes: opts.invoiceNotes,
      sourceInvoiceId: opts.sourceInvoiceId,
      sourceDraftId: opts.sourceDraftId,
      assumptions: opts.plan.assumptions,
      decision,
      status: decision.outcome === "block" ? "BLOCKED" : "PROPOSED",
      createdAt: now(),
      updatedAt: now(),
    };
    db.purchases.unshift(rec);
    audit(db, {
      actor: "agent",
      action: decision.outcome === "block" ? "policy.blocked.spend" : decision.outcome === "needs_approval" ? "policy.needs_approval.spend" : "policy.allowed.spend",
      purchaseId: rec.id,
      direction: "spend",
      detail: decision.reasons.join(" "),
    });
    if (injection.detected) {
      audit(db, { actor: "system", action: "guard.blocked.injection", purchaseId: rec.id, direction: "spend", detail: `signals: ${injection.signals.join(", ")}` });
    }
    return purchaseView(rec);
  });
}

export async function proposePurchase(prompt: string, untrustedContext = "") {
  const { plan, source } = await planPurchase(prompt, untrustedContext);
  return recordProposed({
    prompt,
    untrustedContext: untrustedContext || undefined,
    plan: { ...plan, assumptions: plan.assumptions },
    source,
    kind: "catalog",
  });
}

export type IntakeInput = {
  merchant: string;
  item: string;
  amount: number;
  currency?: string;
  category?: Category;
  notes?: string;
  invoiceId?: string;
  sourceDraftId?: string;
};

/**
 * Invoice Intake (closed-loop agent-to-agent commerce):
 * a seller-issued PayPal invoice is received as untrusted data, its notes are
 * scanned for invoice-borne prompt injection, and the same spend policy +
 * exact-order-bound approval token decide whether the buyer agent may pay.
 */
export async function intakeInvoice(input: IntakeInput) {
  const merchant = String(input.merchant ?? "").trim();
  const item = String(input.item ?? "").trim();
  const amount = Number(input.amount);
  const currency = (input.currency ?? "USD").toUpperCase();
  const notes = String(input.notes ?? "");
  if (!merchant || !item) throw new ApprovalError("Incoming invoice needs a merchant and an item", 400);
  if (!Number.isFinite(amount) || amount <= 0) throw new ApprovalError("Incoming invoice needs a positive amount", 400);
  const category = input.category ?? "design";
  const invoiceId = input.invoiceId?.trim() || undefined;
  const untrusted = [
    invoiceId ? `PayPal invoice ${invoiceId}` : "Incoming PayPal invoice",
    `From: ${merchant}`,
    `Item: ${item}`,
    `Amount: ${currency} ${amount.toFixed(2)}`,
    notes ? `Notes to buyer:\n${notes}` : "",
  ].filter(Boolean).join("\n");

  return recordProposed({
    prompt: `Pay incoming invoice from ${merchant} for ${item} (${currency} ${amount.toFixed(2)})`,
    untrustedContext: untrusted,
    plan: {
      item,
      merchant,
      amount,
      currency,
      category,
      quantity: 1,
      assumptions: [
        "Planned from the incoming invoice itself (the invoice is the source of truth, not a catalog guess).",
        "Invoice notes and memo were scanned for prompt injection before any policy allow.",
      ],
    },
    source: "mock",
    kind: "invoice_intake",
    invoiceNotes: notes || undefined,
    sourceInvoiceId: invoiceId,
    sourceDraftId: input.sourceDraftId,
  });
}

/** Closed loop: take a bill-side draft this app issued and present it to the buyer-side guard. */
export async function intakeFromDraft(draftId: string) {
  const rec = await read((db) => db.drafts.find((d) => d.id === draftId));
  if (!rec) throw new ApprovalError("Invoice draft not found", 404);
  if (rec.status === "DRAFTED") throw new ApprovalError("Create the PayPal invoice before sending it to Invoice Intake", 409);
  const totals = computeTotals(rec.draft);
  const item = rec.draft.items[0]?.name ?? "Invoice";
  // Buyer-side merchant is the issuing business. In this single-tenant demo
  // the issuer is Northline Studio (on the default allowlist) so a clean
  // invoice can be approved; the PayPal invoice id and notes stay real.
  return intakeInvoice({
    merchant: "Northline Studio",
    item: rec.draft.items.length > 1 ? `${item} + ${rec.draft.items.length - 1} more` : item,
    amount: totals.total,
    currency: rec.draft.currency,
    category: "design",
    notes: rec.draft.notes,
    invoiceId: rec.paypal?.invoiceId,
    sourceDraftId: rec.id,
  });
}

export async function approvePurchase(id: string, hash: string) {
  return tx((db) => {
    const rec = must(getPurchase(db, id));
    const token = issueSpendApproval(db, rec, hash);
    audit(db, { actor: "user", action: "approval.capture", purchaseId: id, direction: "spend", detail: "single-use token issued (10 min), bound to this exact item, merchant and amount" });
    return { token };
  });
}

/**
 * The only path that creates or captures a PayPal order for a spend.
 * Consumes a single-use approval token; a missing token is a 403.
 */
export async function executePurchase(id: string, token: string | undefined) {
  const out = await tx((db) => {
    const r = must(getPurchase(db, id));
    try { consumeSpendApproval(db, r, token); }
    catch (e) { audit(db, { actor: "system", action: "guard.blocked.capture", purchaseId: id, direction: "spend", detail: (e as Error).message }); return { err: e as Error }; }
    r.guardApprovedAt = now();
    r.updatedAt = now();
    return { rec: structuredClone(r) };
  });
  if ("err" in out) throw out.err;
  const rec = out.rec;
  const gw = ordersGateway();
  try {
    const created = await gw.create({ amount: rec.amount, currency: rec.currency, item: rec.item, merchant: rec.merchant, customId: rec.id, intent: "CAPTURE" });
    await tx((db) => {
      const r = must(getPurchase(db, id));
      r.paypal = { orderId: created.orderId, status: created.status, mode: gw.mode, approveUrl: created.approveUrl, lastCheckedAt: now() };
      r.updatedAt = now();
      audit(db, { actor: "system", action: "paypal.order.create", purchaseId: id, direction: "spend", detail: `${gw.mode} ${created.orderId} → ${created.status}` });
    });
    try {
      const captured = await gw.capture(created.orderId);
      return tx((db) => {
        const r = must(getPurchase(db, id));
        r.paypal = { orderId: captured.orderId, status: captured.status, mode: gw.mode, approveUrl: captured.approveUrl ?? created.approveUrl, captureId: captured.captureId, lastCheckedAt: now() };
        r.status = captured.status === "COMPLETED" ? "COMPLETED" : "AWAITING_PAYER";
        r.updatedAt = now();
        audit(db, { actor: "system", action: "paypal.order.capture", purchaseId: id, direction: "spend", detail: `${gw.mode} ${captured.orderId} → ${captured.status}` });
        return purchaseView(r);
      });
    } catch (capErr) {
      return tx((db) => {
        const r = must(getPurchase(db, id));
        r.paypal = { ...(r.paypal ?? { orderId: created.orderId, status: created.status, mode: gw.mode }), approveUrl: created.approveUrl, lastCheckedAt: now() };
        r.status = "AWAITING_PAYER";
        r.updatedAt = now();
        audit(db, { actor: "system", action: "paypal.order.capture.pending", purchaseId: id, direction: "spend", detail: `Payer approval needed. ${(capErr as Error).message.slice(0, 240)}` });
        return purchaseView(r);
      });
    }
  } catch (e) {
    await tx((db) => {
      const r = getPurchase(db, id);
      if (r) { r.status = "FAILED"; r.updatedAt = now(); }
      audit(db, { actor: "system", action: "paypal.order.failed", purchaseId: id, direction: "spend", detail: (e as Error).message.slice(0, 300) });
    });
    throw e;
  }
}

/** After the sandbox buyer approves the PayPal order, finish the capture. Requires a prior guard approval on this exact purchase. */
export async function finalizePurchase(id: string) {
  const rec = await read((db) => must(getPurchase(db, id)));
  if (!rec.guardApprovedAt) throw new ApprovalError("This purchase was never approved; nothing goes to PayPal without your approval", 403);
  if (rec.status !== "AWAITING_PAYER" || !rec.paypal?.orderId) throw new ApprovalError(`Cannot finalize a purchase in state ${rec.status}`, 409);
  const gw = ordersGateway();
  const captured = await gw.capture(rec.paypal.orderId);
  return tx((db) => {
    const r = must(getPurchase(db, id));
    r.paypal = { ...r.paypal!, orderId: captured.orderId, status: captured.status, mode: gw.mode, captureId: captured.captureId ?? r.paypal?.captureId, lastCheckedAt: now() };
    r.status = captured.status === "COMPLETED" ? "COMPLETED" : r.status;
    r.updatedAt = now();
    audit(db, { actor: "system", action: "paypal.order.capture", purchaseId: id, direction: "spend", detail: `${gw.mode} ${captured.orderId} → ${captured.status}` });
    return purchaseView(r);
  });
}

export async function refreshPurchase(id: string) {
  const rec = await read((db) => must(getPurchase(db, id)));
  if (!rec.paypal?.orderId) throw new ApprovalError("Not in PayPal yet", 409);
  const gw = ordersGateway();
  const ref = await gw.get(rec.paypal.orderId);
  return tx((db) => {
    const r = must(getPurchase(db, id));
    r.paypal = { ...r.paypal!, status: ref.status, approveUrl: ref.approveUrl ?? r.paypal?.approveUrl, captureId: ref.captureId ?? r.paypal?.captureId, lastCheckedAt: now() };
    if (ref.status === "COMPLETED") r.status = "COMPLETED";
    r.updatedAt = now();
    audit(db, { actor: "system", action: "paypal.order.status", purchaseId: id, direction: "spend", detail: ref.status });
    return purchaseView(r);
  });
}

export const listPurchases = () => read((db) => db.purchases.map(purchaseView));
export const getPurchaseView = (id: string) => read((db) => purchaseView(must(getPurchase(db, id))));
