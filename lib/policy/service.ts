import { tx, read, audit, now, type PolicyRecord, type PurchaseRecord } from "../store";
import { compilePolicy } from "./compiler";
import { dayKey } from "./engine";
import { DEFAULT_POLICY_TEXT } from "./default";
import type { Policy } from "./schema";

export function dailySpentOn(purchases: PurchaseRecord[], todayIso = now(), timeZone = "Asia/Calcutta"): number {
  const day = dayKey(todayIso, timeZone);
  const spent = purchases
    .filter((p) => p.status === "COMPLETED" && dayKey(p.updatedAt || p.createdAt, timeZone) === day)
    .reduce((s, p) => s + p.amount, 0);
  return Math.round(spent * 100) / 100;
}

export function budgetView(policy: Policy, purchases: PurchaseRecord[], todayIso = now()) {
  const dailySpent = dailySpentOn(purchases, todayIso);
  return {
    currency: policy.currency,
    dailyCap: policy.dailyCap,
    dailySpent,
    dailyRemaining: Math.max(0, Math.round((policy.dailyCap - dailySpent) * 100) / 100),
    today: dayKey(todayIso),
  };
}

export async function compileAndSavePolicy(plainEnglish: string) {
  const { policy, source } = await compilePolicy(plainEnglish);
  return tx((db) => {
    const rec: PolicyRecord = { plainEnglish, compiled: policy, source, compiledAt: now() };
    db.policy = rec;
    audit(db, { actor: "user", action: "policy.compiled", direction: "spend", detail: `${source}; daily cap ${policy.currency} ${policy.dailyCap}; approval over ${policy.approvalThreshold}` });
    return { ...rec, budget: budgetView(policy, db.purchases) };
  });
}

/** Return the saved policy, or compile and persist the default demo policy on first use. */
export async function getOrInitPolicy() {
  const existing = read((db) => db.policy);
  if (existing) {
    return read((db) => ({ ...existing, budget: budgetView(existing.compiled, db.purchases) }));
  }
  return compileAndSavePolicy(DEFAULT_POLICY_TEXT);
}

export function peekPolicy() {
  return read((db) => {
    if (!db.policy) return null;
    return { ...db.policy, budget: budgetView(db.policy.compiled, db.purchases) };
  });
}
