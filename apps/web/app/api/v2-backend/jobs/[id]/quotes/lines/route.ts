import { quoteAddLineFailure } from "@jobguard/api/workspace";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession, practiceFailure } from "../../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../../../contractor/origin";
import { workspaceApplication } from "../../../../../../lib/workspace-server";

export const dynamic = "force-dynamic";
type Route = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };

function failure(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers });
}

// V2-C6, V2 only. Adds one unpriced line to a quote before it is sent. The body is the strict
// v2-quote-add-line.v1 command. The line reaches the quote at the builder's next draft save.
export async function POST(request: Request, { params }: Route) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return failure("UNAUTHENTICATED", 401);
  // Rule 21: configured origins only, never the request URL or forwarded headers.
  if (!isTrustedBrowserOrigin(request)) return failure("ORIGIN_FORBIDDEN", 403);
  let body: unknown;
  try { body = await request.json(); } catch { return failure("QUOTE_ADD_LINE_INVALID", 400); }
  try {
    const receipt = await (await workspaceApplication()).quoteLines.add((await params).id, body);
    return NextResponse.json(receipt, { status: receipt.replayed ? 200 : 201, headers });
  } catch (error) {
    const known = quoteAddLineFailure(error);
    if (known) return failure(known.code, known.status);
    return practiceFailure(error) ?? failure("QUOTE_ADD_LINE_UNAVAILABLE", 503);
  }
}
