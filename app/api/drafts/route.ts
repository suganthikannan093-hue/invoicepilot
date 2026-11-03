import { handle } from "@/lib/http";
import { createDraftFromText, list } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = () => handle(list);
export const POST = async (req: Request) => handle(async () => createDraftFromText(String((await req.json()).prompt ?? "")));
