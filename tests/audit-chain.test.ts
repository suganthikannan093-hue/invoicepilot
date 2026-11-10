import { describe, it, expect } from "vitest";
import { AUDIT_GENESIS, sealAudit, verifyChain, rehashChain, receiptFor } from "@/lib/audit";
import type { AuditEntry } from "@/lib/store";

function entry(partial: Partial<AuditEntry> = {}): Omit<AuditEntry, "hash" | "prevHash"> {
  return { at: "2026-11-10T12:00:00.000Z", actor: "system", action: "policy.allowed.spend", direction: "spend", detail: "ok", ...partial };
}

describe("hash-chained audit log", () => {
  it("seals a genesis-linked first entry and verifies", () => {
    const a = sealAudit(AUDIT_GENESIS, entry());
    expect(a.prevHash).toBe(AUDIT_GENESIS);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    const v = verifyChain([a]);
    expect(v.ok).toBe(true);
    expect(v.checked).toBe(1);
    expect(v.head).toBe(a.hash);
  });

  it("detects a tampered detail on a sealed entry", () => {
    const a = sealAudit(AUDIT_GENESIS, entry());
    const b = sealAudit(a.hash!, entry({ at: "2026-11-10T12:00:01.000Z", action: "approval.capture" }));
    const log = [b, a]; // newest first
    expect(verifyChain(log).ok).toBe(true);
    const tampered = { ...a, detail: "altered after the fact" };
    const broken = [b, tampered];
    const v = verifyChain(broken);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/mismatch/i);
  });

  it("rehashes a legacy unsealed log into a valid chain", () => {
    const legacy: AuditEntry[] = [
      { at: "2026-11-10T12:00:02.000Z", actor: "user", action: "approval.capture" },
      { at: "2026-11-10T12:00:01.000Z", actor: "agent", action: "policy.allowed.spend" },
    ];
    const sealed = rehashChain(legacy);
    expect(verifyChain(sealed).ok).toBe(true);
    expect(sealed[1].prevHash).toBe(AUDIT_GENESIS);
    expect(sealed[0].prevHash).toBe(sealed[1].hash);
  });

  it("exports a receipt for a purchase decision", () => {
    const a = sealAudit(AUDIT_GENESIS, entry({ purchaseId: "pur_1" }));
    const r = receiptFor([a], (e) => e.purchaseId === "pur_1");
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.verification.ok).toBe(true);
      expect(r.entry.purchaseId).toBe("pur_1");
      expect(r.product).toBe("SpendGuard");
    }
  });
});
