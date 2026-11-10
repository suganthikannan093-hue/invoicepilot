import { tx, read, audit, getPurchase, newPurchaseId, now, type PurchaseRecord } from "../store";
import { planPurchase } from "./plan";
import { detectInjection, evaluateSpend } from "../policy/engine";
import { getOrInitPolicy, dailySpentOn } from "../policy/service";
import { issueSpendApproval, consumeSpendApproval, purchaseContentHash, ApprovalError } from "../approval";
import { ordersGateway } from "../paypal/orders";

export function purchaseView(rec: PurchaseRecord) {
  return { ...rec, hash: purchaseContentHash(rec) };
}

const must = (r: PurchaseRecord | undefined) => { if (!r) throw new ApprovalError("Purchase not found", 404); return r; };

export async function proposePurchase(prompt: string, untrustedContext = "") {
  const policyRec = await getOrInitPolicy();
  const injection = detectInjection(`${prompt}\n${untrustedContext}`);
  const { plan, source } = await planPurchase(prompt, untrustedContext);
  return tx((db) => {
    const dailySpent = dailySpentOn(db.purchases);
    const decision = evaluateSpend({
      policy: policyRec.compiled,
      purchase: { amount: plan.amount, currency: plan.currency, category: plan.category, merchant: plan.merchant },
      dailySpent,
      injectionDetected: injection.detected,
    });
    const rec: PurchaseRecord = {
      id: newPurchaseId(),
      prompt,
      untrustedContext: untrustedContext || undefined,
      injectionDetected: injection.detected,
      injectionSignals: injection.signals,
      item: plan.item,
      merchant: plan.merchant,
      amount: plan.amount,
      currency: plan.currency,
      category: plan.category,
      quantity: plan.quantity,
      source,
      assumptions: plan.assumptions,
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

export function approvePurchase(id: string, hash: string) {
  return tx((db) => {
    const rec = must(getPurchase(db, id));
    const token = issueSpendApproval(db, rec, hash);
    audit(db, { actor: "user", action: "approval.capture", purchaseId: id, direction: "spend", detail: "single-use token issued (10 min), bound to this exact order" });
    return { token };
  });
}

/**
 * The only path that creates or captures a PayPal order for a spend.
 * Consumes a single-use approval token; a missing token is a 403.
 */
export async function executePurchase(id: string, token: string | undefined) {
  const out = tx((db) => {
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
    tx((db) => {
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
    tx((db) => {
      const r = getPurchase(db, id);
      if (r) { r.status = "FAILED"; r.updatedAt = now(); }
      audit(db, { actor: "system", action: "paypal.order.failed", purchaseId: id, direction: "spend", detail: (e as Error).message.slice(0, 300) });
    });
    throw e;
  }
}

/** After the sandbox buyer approves the PayPal order, finish the capture. Requires a prior guard approval on this exact purchase. */
export async function finalizePurchase(id: string) {
  const rec = read((db) => must(getPurchase(db, id)));
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
  const rec = read((db) => must(getPurchase(db, id)));
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
