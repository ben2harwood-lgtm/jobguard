import { NextResponse } from "next/server";
import { debitPracticeFailure } from "@jobguard/api/direct-debit-practice";
import { directDebitPractice } from "../../../../lib/direct-debit-practice-server";
import { isTrustedBrowserOrigin } from "../../../contractor/origin";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ id: string }> };
function fail(error: unknown) { const failure = debitPracticeFailure(error); return NextResponse.json(failure.body, { status: failure.status, headers }); }
function guard(request: Request) {
  if (request.headers.has("x-tenant-id") || new URL(request.url).search) throw new Error("NOT_FOUND");
}
export async function GET(request: Request, { params }: Context) {
  try { guard(request); return NextResponse.json(await directDebitPractice((await params).id), { headers }); }
  catch (error) { return fail(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    guard(request);
    if (!isTrustedBrowserOrigin(request)) throw new Error("ORIGIN_FORBIDDEN");
    const raw: unknown = await request.json().catch(() => null);
    return NextResponse.json(await directDebitPractice((await params).id, raw), { headers });
  } catch (error) { return fail(error); }
}
