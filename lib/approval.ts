import crypto from "node:crypto";
import type { DB, DraftRecord, DraftStatus } from "./store";
import { InvoiceDraftSchema } from "./schema";

/** Every PayPal write the app can perform. */
export type WriteAction = "create" | "send" | "remind";

/** Which draft states each write is allowed from (the state machine). */
export const ALLOWED_FROM: Record<WriteAction, DraftStatus[]> = {
  create: ["DRAFTED"],
  send: ["CREATED"],
  remind: ["SENT"],
};

const TTL_MS = 10 * 60 * 1000;

export class ApprovalError extends Error { constructor(msg: string, public status = 403) { super(msg); } }

/** Hash of exactly what the user saw and approved; any later edit invalidates the approval. */
export function contentHash(rec: DraftRecord, action: WriteAction): string {
  const payload = action === "remind" ? { r: rec.reminder, id: rec.paypal?.invoiceId } : { d: rec.draft, id: rec.paypal?.invoiceId ?? null };
  return crypto.createHash("sha256").update(action + JSON.stringify(payload)).digest("hex");
}
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function checkPreconditions(rec: DraftRecord, action: WriteAction) {
  if (!ALLOWED_FROM[action].includes(rec.status)) throw new ApprovalError(`Cannot ${action} an invoice in state ${rec.status}`, 409);
  if (action === "create") {
    const v = InvoiceDraftSchema.safeParse(rec.draft);
    if (!v.success) throw new ApprovalError("Draft is invalid; fix it before approving", 422);
  }
  if ((action === "send" || action === "remind") && !rec.paypal?.invoiceId) throw new ApprovalError("No PayPal invoice yet", 409);
  if (action === "remind" && !rec.reminder) throw new ApprovalError("Draft a reminder first", 409);
}

/** Called only from the explicit user "Approve" click. Returns a single-use token. */
export function issueApproval(db: DB, rec: DraftRecord, action: WriteAction, clientHash: string, at = Date.now()): string {
  checkPreconditions(rec, action);
  const h = contentHash(rec, action);
  if (clientHash !== h) throw new ApprovalError("What you approved differs from the saved draft. Reload and review again.", 409);
  const token = crypto.randomBytes(24).toString("base64url");
  db.approvals = db.approvals.filter((a) => a.expiresAt > at && !a.used);
  db.approvals.push({ tokenHash: sha(token), draftId: rec.id, action, contentHash: h, expiresAt: at + TTL_MS, used: false });
  return token;
}

/** Guard in front of every PayPal write. Consumes the token. */
export function consumeApproval(db: DB, rec: DraftRecord, action: WriteAction, token: string | undefined, at = Date.now()) {
  if (!token) throw new ApprovalError("Missing approval token: nothing goes to PayPal without your approval");
  checkPreconditions(rec, action);
  const a = db.approvals.find((x) => x.tokenHash === sha(token));
  if (!a) throw new ApprovalError("Unknown approval token");
  if (a.used) throw new ApprovalError("Approval token already used");
  if (a.expiresAt <= at) throw new ApprovalError("Approval expired; approve again");
  if (a.draftId !== rec.id || a.action !== action) throw new ApprovalError("Approval token is for a different action");
  if (a.contentHash !== contentHash(rec, action)) throw new ApprovalError("Draft changed after approval; approve again");
  a.used = true;
}
