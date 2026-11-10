import { handle } from "@/lib/http";
import { modes } from "@/lib/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = () => handle(() => modes());
