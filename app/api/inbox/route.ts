import { handle } from "@/lib/http";
import { intakeInvoice, intakeFromDraft, listPurchases } from "@/lib/spend/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = () => handle(async () => {
  const all = await listPurchases();
  return all.filter((p) => p.kind === "invoice_intake");
});
export const POST = async (req: Request) => handle(async () => {
  const b = await req.json();
  if (b.draftId) return intakeFromDraft(String(b.draftId));
  return intakeInvoice({
    merchant: String(b.merchant ?? ""),
    item: String(b.item ?? ""),
    amount: Number(b.amount),
    currency: b.currency,
    category: b.category,
    notes: b.notes,
    invoiceId: b.invoiceId,
    sourceDraftId: b.sourceDraftId,
  });
});
