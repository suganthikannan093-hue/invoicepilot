import { handle } from "@/lib/http";
import { simulatePolicy } from "@/lib/policy/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = async (req: Request) => handle(async () => {
  const b = await req.json().catch(() => ({}));
  return simulatePolicy(String(b.plainEnglish ?? ""));
});
