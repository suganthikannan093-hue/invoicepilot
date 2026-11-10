import { handle } from "@/lib/http";
import { getPurchaseView, refreshPurchase } from "@/lib/spend/service";
type P = { params: Promise<{ id: string }> };
export const GET = async (_: Request, { params }: P) => handle(async () => getPurchaseView((await params).id));
export const POST = async (req: Request, { params }: P) => handle(async () => {
  const b = await req.json().catch(() => ({}));
  if (b.action === "status") return refreshPurchase((await params).id);
  return getPurchaseView((await params).id);
});
