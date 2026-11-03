import { handle } from "@/lib/http";
import { modes } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = () => handle(() => ({ ok: true, ...modes() }));
