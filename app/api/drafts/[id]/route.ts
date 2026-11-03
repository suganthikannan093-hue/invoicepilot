import { handle } from "@/lib/http";
import { get, updateDraft } from "@/lib/service";
type P = { params: Promise<{ id: string }> };
export const GET = async (_: Request, { params }: P) => handle(async () => get((await params).id));
export const PATCH = async (req: Request, { params }: P) => handle(async () => updateDraft((await params).id, (await req.json()).draft));
