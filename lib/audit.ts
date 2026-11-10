import crypto from "node:crypto";
import type { AuditEntry } from "./store";

export const AUDIT_GENESIS = crypto.createHash("sha256").update("spendguard:audit:genesis:v1").digest("hex");

function sha(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Canonical payload hashed into the chain — excludes hash / prevHash themselves. */
export function canonicalAudit(e: Omit<AuditEntry, "hash" | "prevHash">): string {
  return JSON.stringify({
    at: e.at,
    actor: e.actor,
    action: e.action,
    draftId: e.draftId ?? null,
    purchaseId: e.purchaseId ?? null,
    direction: e.direction ?? null,
    detail: e.detail ?? null,
  });
}

export function chainHash(prevHash: string, entry: Omit<AuditEntry, "hash" | "prevHash">): string {
  return sha(prevHash + "\n" + canonicalAudit(entry));
}

export function sealAudit(prevHash: string, entry: Omit<AuditEntry, "hash" | "prevHash">): AuditEntry {
  const hash = chainHash(prevHash, entry);
  return { ...entry, prevHash, hash };
}

export type ChainVerification = {
  ok: boolean;
  checked: number;
  head: string;
  brokenAt?: number;
  reason?: string;
};

/**
 * Verify a hash chain. Entries are stored newest-first; verification walks oldest-first.
 * Records without a hash (legacy) fail unless `rehash` rebuilt them first.
 */
export function verifyChain(entries: AuditEntry[]): ChainVerification {
  const oldestFirst = [...entries].reverse();
  let prev = AUDIT_GENESIS;
  for (let i = 0; i < oldestFirst.length; i++) {
    const e = oldestFirst[i];
    if (!e.hash || !e.prevHash) {
      return { ok: false, checked: i, head: prev, brokenAt: i, reason: "Missing hash or prevHash on an audit entry." };
    }
    if (e.prevHash !== prev) {
      return { ok: false, checked: i, head: prev, brokenAt: i, reason: `prevHash mismatch at entry ${i}.` };
    }
    const expected = chainHash(prev, e);
    if (e.hash !== expected) {
      return { ok: false, checked: i, head: prev, brokenAt: i, reason: `Hash mismatch at entry ${i}: entry was altered after it was sealed.` };
    }
    prev = e.hash;
  }
  return { ok: true, checked: oldestFirst.length, head: prev };
}

/** Rebuild hashes from the oldest entry forward. Used when loading a pre-chain store. */
export function rehashChain(entries: AuditEntry[]): AuditEntry[] {
  const oldestFirst = [...entries].reverse();
  let prev = AUDIT_GENESIS;
  const sealed: AuditEntry[] = [];
  for (const e of oldestFirst) {
    const { hash: _h, prevHash: _p, ...rest } = e;
    const next = sealAudit(prev, rest);
    sealed.push(next);
    prev = next.hash!;
  }
  return sealed.reverse();
}

export function receiptFor(entries: AuditEntry[], predicate: (e: AuditEntry) => boolean) {
  const verification = verifyChain(entries);
  const match = entries.find(predicate);
  if (!match) return { found: false as const, verification };
  return {
    found: true as const,
    product: "SpendGuard",
    issuedAt: new Date().toISOString(),
    entry: match,
    head: verification.head,
    verification,
    note: "This receipt is the hash-chained audit record for one decision. Anyone can re-hash the canonical fields against prevHash to confirm it has not been edited.",
  };
}
