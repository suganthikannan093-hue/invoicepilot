import { handle } from "@/lib/http";
import { importFromPayPal } from "@/lib/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = async (req: Request) => handle(async () => importFromPayPal(String((await req.json()).invoiceId ?? "")));
