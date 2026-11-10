import { handle } from "@/lib/http";
import { listPurchases, proposePurchase } from "@/lib/spend/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = () => handle(listPurchases);
export const POST = async (req: Request) => handle(async () => {
  const b = await req.json();
  return proposePurchase(String(b.prompt ?? ""), String(b.untrustedContext ?? ""));
});
