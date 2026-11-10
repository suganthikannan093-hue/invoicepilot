import { z } from "zod";
import { CURRENCIES } from "../schema";

export const CATEGORIES = ["software", "design", "gift_card", "crypto", "supplies", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PolicySchema = z.object({
  currency: z.enum(CURRENCIES).default("USD"),
  dailyCap: z.number().nonnegative(),
  allowedCategories: z.array(z.enum(CATEGORIES)).min(1),
  blockedCategories: z.array(z.enum(CATEGORIES)).default([]),
  approvalThreshold: z.number().nonnegative(),
  merchantAllowlist: z.array(z.string().trim().min(1)).default([]),
  bill: z.object({
    requireApproval: z.boolean().default(true),
    maxInvoiceAmount: z.number().positive().default(10_000),
  }).default({ requireApproval: true, maxInvoiceAmount: 10_000 }),
});

export type Policy = z.infer<typeof PolicySchema>;

export const policyJsonSchema = {
  name: "spend_policy",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["currency", "dailyCap", "allowedCategories", "blockedCategories", "approvalThreshold", "merchantAllowlist", "bill"],
    properties: {
      currency: { type: "string", enum: [...CURRENCIES] },
      dailyCap: { type: "number", description: "Maximum spend in policy currency per calendar day" },
      allowedCategories: { type: "array", items: { type: "string", enum: [...CATEGORIES] } },
      blockedCategories: { type: "array", items: { type: "string", enum: [...CATEGORIES] } },
      approvalThreshold: { type: "number", description: "Purchases over this amount need a human approval token" },
      merchantAllowlist: { type: "array", items: { type: "string" }, description: "Exact merchant names the agent may buy from; empty means none" },
      bill: {
        type: "object",
        additionalProperties: false,
        required: ["requireApproval", "maxInvoiceAmount"],
        properties: {
          requireApproval: { type: "boolean" },
          maxInvoiceAmount: { type: "number", description: "Maximum invoice total in policy currency" },
        },
      },
    },
  },
} as const;

export type PolicyOutcome = "allow" | "block" | "needs_approval";

export interface PolicyDecision {
  outcome: PolicyOutcome;
  reasons: string[];
  rulesFired: string[];
  dailySpent: number;
  dailyRemaining: number;
}

export const PurchasePlanSchema = z.object({
  item: z.string().trim().min(1).max(200),
  merchant: z.string().trim().min(1).max(140),
  amount: z.number().nonnegative().max(1_000_000),
  currency: z.enum(CURRENCIES).default("USD"),
  category: z.enum(CATEGORIES),
  quantity: z.number().int().positive().max(1_000).default(1),
  assumptions: z.array(z.string()).default([]),
});

export type PurchasePlan = z.infer<typeof PurchasePlanSchema>;

export const purchasePlanJsonSchema = {
  name: "purchase_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["item", "merchant", "amount", "currency", "category", "quantity", "assumptions"],
    properties: {
      item: { type: "string" },
      merchant: { type: "string" },
      amount: { type: "number", description: "Total amount to charge, not unit price" },
      currency: { type: "string", enum: [...CURRENCIES] },
      category: { type: "string", enum: [...CATEGORIES] },
      quantity: { type: "integer" },
      assumptions: { type: "array", items: { type: "string" } },
    },
  },
} as const;
