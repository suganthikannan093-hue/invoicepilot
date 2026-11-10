import { handle } from "@/lib/http";
import { verifyAudit } from "@/lib/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = () => handle(() => verifyAudit());
export const POST = () => handle(() => verifyAudit());
