import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { InvoiceDraft } from "./schema";
import type { Policy, PolicyDecision, Category } from "./policy/schema";
import { AUDIT_GENESIS, rehashChain, sealAudit } from "./audit";

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
export type PurchaseKind = "catalog" | "invoice_intake";

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
  kind?: PurchaseKind;
  invoiceNotes?: string;
  sourceInvoiceId?: string;
  sourceDraftId?: string;
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
  prevHash?: string;
  hash?: string;
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

const REDIS_KEY = () => process.env.SPENDGUARD_REDIS_KEY ?? "spendguard:db";
const LOCK_KEY = () => `${REDIS_KEY()}:lock`;

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function storeKind(): "redis" | "file" {
  return redisConfigured() ? "redis" : "file";
}

const file = () => process.env.SPENDGUARD_DB ?? process.env.INVOICEPILOT_DB ?? path.join(process.cwd(), "data", "db.json");

export function empty(): DB {
  return { drafts: [], purchases: [], policy: null, audit: [], approvals: [] };
}

function normalize(raw: Partial<DB> | null | undefined): DB {
  const db: DB = {
    drafts: raw?.drafts ?? [],
    purchases: raw?.purchases ?? [],
    policy: raw?.policy ?? null,
    audit: raw?.audit ?? [],
    approvals: raw?.approvals ?? [],
  };
  const needsRehash = db.audit.length > 0 && db.audit.some((a) => !a.hash || !a.prevHash);
  if (needsRehash) db.audit = rehashChain(db.audit);
  return db;
}

function fileLoad(): DB {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<DB>;
    return normalize(raw);
  } catch {
    return empty();
  }
}

function fileSave(db: DB) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = file() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file());
}

type RedisClient = {
  get: <T = unknown>(key: string) => Promise<T | null>;
  set: (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => Promise<string | null>;
  del: (key: string) => Promise<number>;
};

let _redis: RedisClient | null | undefined;
function getRedis(): RedisClient {
  if (_redis) return _redis;
  // Lazy require so local/tests without the package still run if we only use the file store.
  // The dependency is declared in package.json for production.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require("@upstash/redis") as { Redis: { fromEnv: () => RedisClient } };
  _redis = Redis.fromEnv();
  return _redis;
}

async function redisLoad(): Promise<DB> {
  const raw = await getRedis().get<DB | string>(REDIS_KEY());
  if (!raw) return empty();
  const data = typeof raw === "string" ? (JSON.parse(raw) as Partial<DB>) : raw;
  return normalize(data);
}

async function redisSave(db: DB): Promise<void> {
  await getRedis().set(REDIS_KEY(), JSON.stringify(db));
}

async function withRedisLock<T>(fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  const token = crypto.randomBytes(12).toString("hex");
  for (let i = 0; i < 25; i++) {
    const ok = await redis.set(LOCK_KEY(), token, { nx: true, ex: 10 });
    if (ok) {
      try {
        return await fn();
      } finally {
        const held = await redis.get<string>(LOCK_KEY());
        if (held === token) await redis.del(LOCK_KEY());
      }
    }
    await new Promise((r) => setTimeout(r, 40 + i * 15));
  }
  throw new Error("Could not acquire SpendGuard store lock");
}

/** Serialised read-modify-write. File-backed locally; Upstash Redis in production. */
export async function tx<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  if (redisConfigured()) {
    return withRedisLock(async () => {
      const db = await redisLoad();
      const r = await fn(db);
      await redisSave(db);
      return r;
    });
  }
  const db = fileLoad();
  const r = await fn(db);
  fileSave(db);
  return r;
}

export async function read<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const db = redisConfigured() ? await redisLoad() : fileLoad();
  return fn(db);
}

export const newId = () => "drf_" + crypto.randomBytes(6).toString("hex");
export const newPurchaseId = () => "pur_" + crypto.randomBytes(6).toString("hex");
export const now = () => new Date().toISOString();

export function audit(db: DB, e: Omit<AuditEntry, "at" | "hash" | "prevHash">) {
  const prev = db.audit[0]?.hash ?? AUDIT_GENESIS;
  const sealed = sealAudit(prev, { at: now(), ...e });
  db.audit.unshift(sealed);
  db.audit = db.audit.slice(0, 500);
}

export function getDraft(db: DB, id: string) { return db.drafts.find((d) => d.id === id); }
export function getPurchase(db: DB, id: string) { return db.purchases.find((p) => p.id === id); }
