import { handle } from "@/lib/http";
import { compileAndSavePolicy, getOrInitPolicy } from "@/lib/policy/service";
export const dynamic = "force-dynamic";
export const GET = () => handle(() => getOrInitPolicy());
export const PUT = async (req: Request) => handle(async () => compileAndSavePolicy(String((await req.json()).plainEnglish ?? "")));
