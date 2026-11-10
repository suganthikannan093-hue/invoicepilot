export const runtime = "nodejs";
import { handle } from "@/lib/http";
import { approve } from "@/lib/service";
import { ApprovalError } from "@/lib/approval";
type P = { params: Promise<{ id: string }> };
/** Issues a single-use approval token. Only the UI's explicit Approve buttons call this. */
export const POST = async (req: Request, { params }: P) => handle(async () => {
  const b = await req.json();
  if (!["create", "send", "remind"].includes(b.action)) throw new ApprovalError("Unknown action", 400);
  if (b.confirm !== true) throw new ApprovalError("Explicit confirm:true required", 400);
  return approve((await params).id, b.action, String(b.contentHash ?? ""));
});
