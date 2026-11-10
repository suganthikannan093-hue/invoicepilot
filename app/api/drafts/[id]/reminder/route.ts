export const runtime = "nodejs";
import { handle } from "@/lib/http";
import { makeReminder, editReminder } from "@/lib/service";
type P = { params: Promise<{ id: string }> };
export const POST = async (req: Request, { params }: P) => handle(async () => makeReminder((await params).id, (await req.json().catch(() => ({}))).tone));
export const PATCH = async (req: Request, { params }: P) => handle(async () => { const b = await req.json(); return editReminder((await params).id, String(b.subject ?? ""), String(b.note ?? "")); });
