export const runtime = "nodejs";
import { handle } from "@/lib/http";
import { executePurchase } from "@/lib/spend/service";
type P = { params: Promise<{ id: string }> };
/** PayPal Orders create + capture. Blocked by the approval guard unless a valid X-Approval-Token is presented. */
export const POST = async (req: Request, { params }: P) => handle(async () => {
  return executePurchase((await params).id, req.headers.get("x-approval-token") ?? undefined);
});
