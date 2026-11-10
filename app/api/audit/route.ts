import { handle } from "@/lib/http";
import { auditLog } from "@/lib/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(() => auditLog(new URL(req.url).searchParams.get("draftId") ?? undefined));
