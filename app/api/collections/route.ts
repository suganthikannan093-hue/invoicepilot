import { handle } from "@/lib/http";
import { collectionsScan } from "@/lib/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = () => handle(() => collectionsScan());
