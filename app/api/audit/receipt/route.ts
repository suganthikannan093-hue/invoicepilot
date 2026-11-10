import { handle } from "@/lib/http";
import { auditReceipt } from "@/lib/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(() => {
  const q = new URL(req.url).searchParams;
  return auditReceipt({ purchaseId: q.get("purchaseId") ?? undefined, draftId: q.get("draftId") ?? undefined });
});
