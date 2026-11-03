import { handle } from "@/lib/http";
import { execute } from "@/lib/service";
import { ApprovalError } from "@/lib/approval";
type P = { params: Promise<{ id: string }> };
/** PayPal writes. Blocked by the approval guard unless a valid X-Approval-Token is presented. */
export const POST = async (req: Request, { params }: P) => handle(async () => {
  const b = await req.json();
  if (!["create", "send", "remind"].includes(b.action)) throw new ApprovalError("Unknown action", 400);
  return execute((await params).id, b.action, req.headers.get("x-approval-token") ?? undefined);
});
