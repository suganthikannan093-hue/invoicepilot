import { NextResponse } from "next/server";
import { ApprovalError } from "./approval";
export async function handle(fn: () => Promise<unknown> | unknown) {
  try { return NextResponse.json(await fn()); }
  catch (e) {
    const status = e instanceof ApprovalError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
