import type { Category, Policy, PolicyDecision } from "./schema";

/** Detect prompt-injection / policy-override attempts in untrusted text (product pages, tool output, prompts). */
export function detectInjection(text: string): { detected: boolean; signals: string[] } {
  const t = text ?? "";
  const rules: { re: RegExp; label: string }[] = [
    { re: /ignore\s+(all\s+)?(previous\s+)?(rules|instructions|policy|the policy)/i, label: "ignore-rules" },
    { re: /disregard\s+(the\s+)?(rules|policy|instructions)/i, label: "disregard-policy" },
    { re: /override\s+(the\s+)?(policy|rules|budget|limit|cap)/i, label: "override-policy" },
    { re: /bypass\s+(the\s+)?(policy|guard|approval|rules)/i, label: "bypass-guard" },
    { re: /do\s+not\s+(ask|check|require)\s+(for\s+)?(approval|permission|the policy)/i, label: "skip-approval" },
    { re: /without\s+(my\s+|human\s+|user\s+)?approval/i, label: "without-approval" },
    { re: /you\s+are\s+now\s+(in\s+)?(unrestricted|developer|jailbreak)/i, label: "jailbreak-role" },
    { re: /\bsystem\s+prompt\b/i, label: "system-prompt" },
    { re: /new\s+instructions\s*:/i, label: "new-instructions" },
  ];
  const signals = rules.filter((r) => r.re.test(t)).map((r) => r.label);
  return { detected: signals.length > 0, signals };
}

export function dayKey(iso: string, timeZone = "Asia/Calcutta"): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone });
}

export function merchantAllowed(merchant: string, allowlist: string[]): boolean {
  const m = merchant.trim().toLowerCase();
  if (!m) return false;
  return allowlist.some((a) => a.trim().toLowerCase() === m);
}

export function evaluateSpend(opts: {
  policy: Policy;
  purchase: { amount: number; currency: string; category: Category; merchant: string };
  dailySpent: number;
  injectionDetected: boolean;
}): PolicyDecision {
  const { policy, purchase, dailySpent, injectionDetected } = opts;
  const reasons: string[] = [];
  const rulesFired: string[] = [];
  const dailyRemaining = Math.max(0, Math.round((policy.dailyCap - dailySpent) * 100) / 100);
  const money = (n: number) => `${policy.currency} ${n.toFixed(2)}`;

  if (injectionDetected) {
    reasons.push("Blocked: untrusted content tried to override your policy (prompt injection). Nothing is sent to PayPal.");
    rulesFired.push("injection");
  }
  if (policy.blockedCategories.includes(purchase.category)) {
    reasons.push(`Blocked: category ${purchase.category} is never allowed.`);
    rulesFired.push("blocked_category");
  }
  if (!policy.allowedCategories.includes(purchase.category)) {
    reasons.push(`Blocked: category ${purchase.category} is not in the allowed list (${policy.allowedCategories.join(", ")}).`);
    rulesFired.push("allowed_categories");
  }
  if (policy.merchantAllowlist.length === 0 || !merchantAllowed(purchase.merchant, policy.merchantAllowlist)) {
    reasons.push(`Blocked: merchant "${purchase.merchant}" is not on your allowlist.`);
    rulesFired.push("merchant_allowlist");
  }
  if (purchase.currency !== policy.currency) {
    reasons.push(`Blocked: currency ${purchase.currency} does not match the policy currency ${policy.currency}.`);
    rulesFired.push("currency");
  }
  const nextTotal = Math.round((dailySpent + purchase.amount) * 100) / 100;
  if (nextTotal > policy.dailyCap) {
    reasons.push(`Blocked: ${money(purchase.amount)} would exceed the ${money(policy.dailyCap)} daily cap (${money(dailySpent)} spent today, ${money(dailyRemaining)} left).`);
    rulesFired.push("daily_cap");
  }

  if (rulesFired.length > 0) {
    return { outcome: "block", reasons, rulesFired, dailySpent, dailyRemaining };
  }

  if (purchase.amount > policy.approvalThreshold) {
    reasons.push(`Needs your approval: ${money(purchase.amount)} is over the ${money(policy.approvalThreshold)} threshold.`);
    rulesFired.push("approval_threshold");
    return { outcome: "needs_approval", reasons, rulesFired, dailySpent, dailyRemaining };
  }

  reasons.push(`Allowed: ${money(purchase.amount)} is within the ${money(policy.approvalThreshold)} threshold, category ${purchase.category} is allowed, merchant "${purchase.merchant}" is on the allowlist, and ${money(nextTotal)} of ${money(policy.dailyCap)} would be spent today.`);
  rulesFired.push("allow");
  return { outcome: "allow", reasons, rulesFired, dailySpent, dailyRemaining };
}

export function evaluateBill(opts: {
  policy: Policy;
  invoice: { total: number; currency: string };
}): PolicyDecision {
  const { policy, invoice } = opts;
  const reasons: string[] = [];
  const rulesFired: string[] = [];
  const money = (n: number) => `${invoice.currency} ${n.toFixed(2)}`;
  if (invoice.total > policy.bill.maxInvoiceAmount) {
    reasons.push(`Blocked: invoice total ${money(invoice.total)} exceeds the policy cap of ${policy.currency} ${policy.bill.maxInvoiceAmount.toFixed(2)}.`);
    rulesFired.push("bill_max");
    return { outcome: "block", reasons, rulesFired, dailySpent: 0, dailyRemaining: policy.dailyCap };
  }
  if (policy.bill.requireApproval) {
    reasons.push(`Needs your approval: every invoice is issued only after a SpendGuard approval token, and ${money(invoice.total)} is within the ${policy.currency} ${policy.bill.maxInvoiceAmount.toFixed(2)} invoice cap.`);
    rulesFired.push("bill_requires_approval");
    return { outcome: "needs_approval", reasons, rulesFired, dailySpent: 0, dailyRemaining: policy.dailyCap };
  }
  reasons.push(`Allowed under policy (invoice cap ${policy.currency} ${policy.bill.maxInvoiceAmount.toFixed(2)}).`);
  rulesFired.push("bill_allow");
  return { outcome: "allow", reasons, rulesFired, dailySpent: 0, dailyRemaining: policy.dailyCap };
}
