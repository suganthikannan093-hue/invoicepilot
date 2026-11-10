import { describe, it, expect, beforeEach } from "vitest";
import { issueApproval, consumeApproval, contentHash } from "@/lib/approval";
import type { DB, DraftRecord } from "@/lib/store";
const rec = (): DraftRecord => ({ id: "drf_1", prompt: "", source: "mock", assumptions: [], status: "DRAFTED", remindersSent: 0, createdAt: "", updatedAt: "",
  draft: { clientName: "A", clientEmail: "a@b.co", currency: "USD", taxPercent: 0, dueDate: "2026-12-01", notes: "", items: [{ name: "x", description: "", quantity: 1, unitPrice: 10, unit: "AMOUNT" }] } });
let db: DB; let r: DraftRecord;
beforeEach(() => { db = { drafts: [], purchases: [], policy: null, audit: [], approvals: [] }; r = rec(); db.drafts.push(r); });
describe("approval guard", () => {
  it("blocks writes with no token", () => { expect(() => consumeApproval(db, r, "create", undefined)).toThrow(/without your approval/); });
  it("allows exactly once with a valid token", () => {
    const t = issueApproval(db, r, "create", contentHash(r, "create"));
    expect(() => consumeApproval(db, r, "create", t)).not.toThrow();
    expect(() => consumeApproval(db, r, "create", t)).toThrow(/already used/);
  });
  it("rejects when the draft changes after approval", () => {
    const t = issueApproval(db, r, "create", contentHash(r, "create"));
    r.draft.items[0].unitPrice = 10000;
    expect(() => consumeApproval(db, r, "create", t)).toThrow(/changed after approval/);
  });
  it("rejects approval of content the user did not see", () => {
    expect(() => issueApproval(db, r, "create", "stale-hash")).toThrow(/differs/);
  });
  it("rejects expired tokens", () => {
    const t = issueApproval(db, r, "create", contentHash(r, "create"), 0);
    expect(() => consumeApproval(db, r, "create", t, 11 * 60 * 1000)).toThrow(/expired/);
  });
  it("token for one action cannot be used for another; state machine enforced", () => {
    const t = issueApproval(db, r, "create", contentHash(r, "create"));
    r.status = "CREATED"; r.paypal = { invoiceId: "INV2-X", status: "DRAFT", mode: "mock" };
    expect(() => consumeApproval(db, r, "send", t)).toThrow(/different action/);
    expect(() => issueApproval(db, r, "create", contentHash(r, "create"))).toThrow(/state CREATED/);
    expect(() => issueApproval(db, r, "remind", contentHash(r, "remind"))).toThrow(/state CREATED/);
  });
  it("refuses to approve an invalid draft", () => {
    r.draft.clientEmail = "nope";
    expect(() => issueApproval(db, r, "create", contentHash(r, "create"))).toThrow(/invalid/);
  });
});
