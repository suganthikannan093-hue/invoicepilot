export const runtime = "nodejs";
import { handle } from "@/lib/http";
import { approvePurchase } from "@/lib/spend/service";
import { ApprovalError } from "@/lib/approval";
type P = { params: Promise<{ id: string }> };
/** Issues a single-use approval token bound to this exact purchase. */
export const POST = async (req: Request, { params }: P) => handle(async () => {
  const b = await req.json();
  if (b.confirm !== true) throw new ApprovalError("Explicit confirm:true required", 400);
  return approvePurchase((await params).id, String(b.contentHash ?? ""));
});
