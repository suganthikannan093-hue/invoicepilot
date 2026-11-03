import { handle } from "@/lib/http";
import { refreshStatus } from "@/lib/service";
type P = { params: Promise<{ id: string }> };
export const POST = async (_: Request, { params }: P) => handle(async () => refreshStatus((await params).id));
