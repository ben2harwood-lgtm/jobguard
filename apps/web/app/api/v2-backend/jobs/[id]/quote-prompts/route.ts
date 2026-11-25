import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession, practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
import { V2_QUOTE_TEMPLATE_KEY } from "../../../../../ui/v2-quote-prompts";

type Route = { params: Promise<{ id: string }> };

function failure(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
}

// V2 only. Tells the scope and quote screens which prompt list applies. It reads the
// captured job to confirm this firm can see it, and writes nothing.
export async function GET(_request: Request, { params }: Route) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return failure("UNAUTHENTICATED", 401);
  try {
    await (await workspaceApplication()).capture.get((await params).id);
    return NextResponse.json({ version: "v2-quote-prompts.v1", templateKey: V2_QUOTE_TEMPLATE_KEY },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return practiceFailure(error) ?? failure("QUOTE_PROMPTS_UNAVAILABLE", 503);
  }
}
