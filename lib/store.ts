import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { InvoiceDraft } from "./schema";
import type { Policy, PolicyDecision, Category } from "./policy/schema";

export type DraftStatus = "DRAFTED" | "CREATED" | "SENT" | "PAID" | "CANCELLED";

export interface ReminderDraft { subject: string; note: string; createdAt: string; source: "openai" | "mock" }

export interface DraftRecord {
  id: string;
  prompt: string;
  draft: InvoiceDraft;
  assumptions: string[];
  source: "openai" | "mock";
  status: DraftStatus;
  paypal?: { invoiceId: string; status: string; mode: string; payerViewUrl?: string; lastCheckedAt?: string };
  reminder?: ReminderDraft;
  remindersSent: number;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseStatus = "PROPOSED" | "BLOCKED" | "COMPLETED" | "AWAITING_PAYER" | "FAILED";

export interface PurchaseRecord {
  id: string;
  prompt: string;
  untrustedContext?: string;
  injectionDetected: boolean;
  injectionSignals: string[];
  item: string;
  merchant: string;
  amount: number;
  currency: string;
  category: Category;
  quantity: number;
  source: "openai" | "mock";
  assumptions: string[];
  decision: PolicyDecision;
  status: PurchaseStatus;
  paypal?: { orderId: string; status: string; mode: string; approveUrl?: string; captureId?: string; lastCheckedAt?: string };
  guardApprovedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRecord {
  plainEnglish: string;
  compiled: Policy;
  source: "openai" | "mock";
  compiledAt: string;
}

export interface AuditEntry {
  at: string;
  actor: "user" | "agent" | "system";
  action: string;
  draftId?: string;
  purchaseId?: string;
  direction?: "spend" | "bill";
  detail?: string;
}

export interface ApprovalRecord {
  tokenHash: string;
  draftId: string;
  action: string;
  contentHash: string;
  expiresAt: number;
  used: boolean;
}

export interface DB {
  drafts: DraftRecord[];
  purchases: PurchaseRecord[];
  policy: PolicyRecord | null;
  audit: AuditEntry[];
  approvals: ApprovalRecord[];
}

const file = () => process.env.SPENDGUARD_DB ?? process.env.INVOICEPILOT_DB ?? path.join(process.cwd(), "data", "db.json");

function empty(): DB { return { drafts: [], purchases: [], policy: null, audit: [], approvals: [] }; }

function load(): DB {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<DB>;
    return {
      drafts: raw.drafts ?? [],
      purchases: raw.purchases ?? [],
      policy: raw.policy ?? null,
      audit: raw.audit ?? [],
      approvals: raw.approvals ?? [],
    };
  } catch { return empty(); }
}
function save(db: DB) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = file() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file());
}
/** Serialised read-modify-write (single process; fine for a local prototype). */
export function tx<T>(fn: (db: DB) => T): T { const db = load(); const r = fn(db); save(db); return r; }
export function read<T>(fn: (db: DB) => T): T { return fn(load()); }

export const newId = () => "drf_" + crypto.randomBytes(6).toString("hex");
export const newPurchaseId = () => "pur_" + crypto.randomBytes(6).toString("hex");
export const now = () => new Date().toISOString();

export function audit(db: DB, e: Omit<AuditEntry, "at">) { db.audit.unshift({ at: now(), ...e }); db.audit = db.audit.slice(0, 500); }
export function getDraft(db: DB, id: string) { return db.drafts.find((d) => d.id === id); }
export function getPurchase(db: DB, id: string) { return db.purchases.find((p) => p.id === id); }
