export const runtime = "nodejs";
import { handle } from "@/lib/http";
import { finalizePurchase } from "@/lib/spend/service";
type P = { params: Promise<{ id: string }> };
/** Resume capture after the sandbox buyer has approved the PayPal order. Requires a prior guard approval. */
export const POST = async (_: Request, { params }: P) => handle(async () => finalizePurchase((await params).id));
