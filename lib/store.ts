import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { InvoiceDraft } from "./schema";

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

export interface AuditEntry { at: string; actor: "user" | "agent" | "system"; action: string; draftId?: string; detail?: string }

interface DB { drafts: DraftRecord[]; audit: AuditEntry[]; approvals: { tokenHash: string; draftId: string; action: string; contentHash: string; expiresAt: number; used: boolean }[] }

const file = () => process.env.INVOICEPILOT_DB ?? path.join(process.cwd(), "data", "db.json");

function load(): DB {
  try { return JSON.parse(fs.readFileSync(file(), "utf8")); } catch { return { drafts: [], audit: [], approvals: [] }; }
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
export const now = () => new Date().toISOString();

export function audit(db: DB, e: Omit<AuditEntry, "at">) { db.audit.unshift({ at: now(), ...e }); db.audit = db.audit.slice(0, 500); }
export function getDraft(db: DB, id: string) { return db.drafts.find((d) => d.id === id); }
export type { DB };
