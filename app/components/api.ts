"use client";

export type Modes = { llm: string; paypal: string; product?: string; policyCompiled?: boolean };
export type Audit = { at: string; actor: string; action: string; draftId?: string; purchaseId?: string; direction?: "spend" | "bill"; detail?: string };

export type PolicyView = {
  plainEnglish: string;
  compiled: {
    currency: string;
    dailyCap: number;
    allowedCategories: string[];
    blockedCategories: string[];
    approvalThreshold: number;
    merchantAllowlist: string[];
    bill: { requireApproval: boolean; maxInvoiceAmount: number };
  };
  source: string;
  compiledAt: string;
  budget: { currency: string; dailyCap: number; dailySpent: number; dailyRemaining: number; today: string };
};

export type Purchase = {
  id: string;
  prompt: string;
  untrustedContext?: string;
  injectionDetected: boolean;
  injectionSignals: string[];
  item: string;
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  quantity: number;
  source: string;
  assumptions: string[];
  decision: { outcome: "allow" | "block" | "needs_approval"; reasons: string[]; rulesFired: string[]; dailySpent: number; dailyRemaining: number };
  status: string;
  paypal?: { orderId: string; status: string; mode: string; approveUrl?: string; captureId?: string; lastCheckedAt?: string };
  hash: string;
  createdAt: string;
};

export async function api<T>(url: string, init?: RequestInit & { json?: unknown; token?: string }): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.token ? { "X-Approval-Token": init.token } : {}) }, body: init?.json === undefined ? init?.body : JSON.stringify(init.json) });
  const j = await res.json();
  if (!res.ok) {
    const err = new Error(j.error ?? res.statusText) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return j as T;
}
