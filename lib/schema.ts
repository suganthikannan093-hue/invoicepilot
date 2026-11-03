import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "JPY", "SGD"] as const;

export const LineItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(200),
  description: z.string().max(1000).default(""),
  quantity: z.number().positive("Quantity must be > 0").max(1_000_000),
  unitPrice: z.number().nonnegative("Unit price can't be negative").max(10_000_000),
  unit: z.enum(["HOURS", "QUANTITY", "AMOUNT"]).default("QUANTITY"),
});

export const InvoiceDraftSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(140),
  clientEmail: z.string().trim().email("A valid client email is required"),
  currency: z.enum(CURRENCIES),
  items: z.array(LineItemSchema).min(1, "Add at least one line item").max(100),
  taxPercent: z.number().min(0).max(100).default(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD"),
  notes: z.string().max(4000).default(""),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type InvoiceDraft = z.infer<typeof InvoiceDraftSchema>;

/** JSON schema used for OpenAI strict structured outputs (mirrors InvoiceDraftSchema). */
export const invoiceJsonSchema = {
  name: "invoice_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["clientName", "clientEmail", "currency", "items", "taxPercent", "dueDate", "notes", "assumptions"],
    properties: {
      clientName: { type: "string" },
      clientEmail: { type: "string", description: "Client email, or empty string if not given" },
      currency: { type: "string", enum: [...CURRENCIES] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "quantity", "unitPrice", "unit"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            quantity: { type: "number" },
            unitPrice: { type: "number" },
            unit: { type: "string", enum: ["HOURS", "QUANTITY", "AMOUNT"] },
          },
        },
      },
      taxPercent: { type: "number" },
      dueDate: { type: "string", description: "YYYY-MM-DD" },
      notes: { type: "string" },
      assumptions: { type: "array", items: { type: "string" }, description: "Anything you inferred or that the user should double-check" },
    },
  },
} as const;

export function formatIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "draft"}: ${i.message}`);
}
