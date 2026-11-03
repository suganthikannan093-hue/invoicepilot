import { tx, read, audit, getDraft, newId, now, type DraftRecord } from "./store";
import { parseInvoice, draftReminder, llmMode } from "./llm";
import { InvoiceDraftSchema, formatIssues } from "./schema";
import { computeTotals, money } from "./totals";
import { issueApproval, consumeApproval, contentHash, ApprovalError, type WriteAction } from "./approval";
import { gateway } from "./paypal";
import { toPayPalInvoice } from "./paypal/payload";

export function view(rec: DraftRecord) {
  const v = InvoiceDraftSchema.safeParse(rec.draft);
  return {
    ...rec,
    totals: computeTotals(rec.draft),
    issues: v.success ? [] : formatIssues(v.error),
    hashes: { create: contentHash(rec, "create"), send: contentHash(rec, "send"), remind: contentHash(rec, "remind") },
  };
}
const must = (r: DraftRecord | undefined) => { if (!r) throw new ApprovalError("Draft not found", 404); return r; };

export function modes() { return { llm: llmMode(), paypal: gateway().mode }; }

export async function createDraftFromText(prompt: string) {
  if (!prompt.trim() || prompt.length > 4000) throw new ApprovalError("Describe the work (1–4000 chars)", 400);
  const r = await parseInvoice(prompt);
  return tx((db) => {
    const rec: DraftRecord = { id: newId(), prompt, draft: r.draft, assumptions: r.assumptions, source: r.source, status: "DRAFTED", remindersSent: 0, createdAt: now(), updatedAt: now() };
    db.drafts.unshift(rec);
    audit(db, { actor: "agent", action: "draft.generated", draftId: rec.id, detail: `${r.source}; ${r.draft.items.length} item(s)` });
    return view(rec);
  });
}

export function updateDraft(id: string, patch: unknown) {
  return tx((db) => {
    const rec = must(getDraft(db, id));
    if (rec.status !== "DRAFTED") throw new ApprovalError("Only un-submitted drafts can be edited", 409);
    rec.draft = patch as DraftRecord["draft"];
    rec.updatedAt = now();
    audit(db, { actor: "user", action: "draft.edited", draftId: id });
    return view(rec);
  });
}

export function approve(id: string, action: WriteAction, hash: string) {
  return tx((db) => {
    const rec = must(getDraft(db, id));
    const token = issueApproval(db, rec, action, hash);
    audit(db, { actor: "user", action: `approval.${action}`, draftId: id, detail: "single-use token issued (10 min)" });
    return { token };
  });
}

/** The only path to a PayPal write: consume approval (sync, persisted) → call PayPal → record. */
export async function execute(id: string, action: WriteAction, token: string | undefined) {
  const out = tx((db) => {
    const r = must(getDraft(db, id));
    try { consumeApproval(db, r, action, token); }
    catch (e) { audit(db, { actor: "system", action: `guard.blocked.${action}`, draftId: id, detail: (e as Error).message }); return { err: e as Error }; }
    return { rec: structuredClone(r) };
  });
  if ("err" in out) throw out.err;
  const rec = out.rec;
  const gw = gateway();
  try {
    let ref;
    if (action === "create") ref = await gw.createDraft(toPayPalInvoice(InvoiceDraftSchema.parse(rec.draft)));
    else if (action === "send") ref = await gw.send(rec.paypal!.invoiceId);
    else { await gw.remind(rec.paypal!.invoiceId, rec.reminder!.subject, rec.reminder!.note); ref = await gw.getStatus(rec.paypal!.invoiceId); }
    return tx((db) => {
      const r = must(getDraft(db, id));
      r.paypal = { ...r.paypal, invoiceId: ref.invoiceId, status: ref.status, mode: gw.mode, payerViewUrl: ref.payerViewUrl ?? r.paypal?.payerViewUrl, lastCheckedAt: now() };
      if (action === "create") r.status = "CREATED";
      if (action === "send") r.status = "SENT";
      if (action === "remind") { r.remindersSent++; r.reminder = undefined; }
      r.updatedAt = now();
      audit(db, { actor: "system", action: `paypal.${action}`, draftId: id, detail: `${gw.mode} ${ref.invoiceId} → ${ref.status}` });
      return view(r);
    });
  } catch (e) {
    tx((db) => audit(db, { actor: "system", action: `paypal.${action}.failed`, draftId: id, detail: (e as Error).message.slice(0, 300) }));
    throw e;
  }
}

export async function refreshStatus(id: string) {
  const rec = read((db) => must(getDraft(db, id)));
  if (!rec.paypal) throw new ApprovalError("Not in PayPal yet", 409);
  const ref = await gateway().getStatus(rec.paypal.invoiceId);
  return tx((db) => {
    const r = must(getDraft(db, id));
    r.paypal = { ...r.paypal!, status: ref.status, lastCheckedAt: now() };
    if (ref.status === "PAID" || ref.status === "MARKED_AS_PAID") r.status = "PAID";
    if (ref.status === "CANCELLED") r.status = "CANCELLED";
    audit(db, { actor: "system", action: "paypal.status", draftId: id, detail: ref.status });
    return view(r);
  });
}

export async function makeReminder(id: string, tone?: "friendly" | "firm") {
  const rec = read((db) => must(getDraft(db, id)));
  if (rec.status !== "SENT") throw new ApprovalError("Reminders are only for sent, unpaid invoices", 409);
  const t = computeTotals(rec.draft);
  const r = await draftReminder({ clientName: rec.draft.clientName, total: money(t.total, rec.draft.currency), currency: rec.draft.currency, dueDate: rec.draft.dueDate, invoiceNumber: rec.paypal?.invoiceId, remindersSent: rec.remindersSent, tone });
  return tx((db) => {
    const x = must(getDraft(db, id));
    x.reminder = { subject: r.subject, note: r.note, source: r.source, createdAt: now() };
    audit(db, { actor: "agent", action: "reminder.drafted", draftId: id, detail: r.source });
    return view(x);
  });
}

export function editReminder(id: string, subject: string, note: string) {
  return tx((db) => {
    const x = must(getDraft(db, id));
    if (!x.reminder) throw new ApprovalError("No reminder draft", 409);
    x.reminder = { ...x.reminder, subject: subject.slice(0, 200), note: note.slice(0, 2000) };
    audit(db, { actor: "user", action: "reminder.edited", draftId: id });
    return view(x);
  });
}

export const list = () => read((db) => db.drafts.map(view));
export const get = (id: string) => read((db) => view(must(getDraft(db, id))));
export const auditLog = (id?: string) => read((db) => db.audit.filter((a) => !id || a.draftId === id).slice(0, 100));
