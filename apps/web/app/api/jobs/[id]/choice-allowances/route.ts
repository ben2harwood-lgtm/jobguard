import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../contractor/origin";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ id: string }> };
// The variation command's own refusals (for example a job that is no longer live) reach the builder as one code.
const draftRefusals = new Set(["JOB_WORK_CLOSED", "FORBIDDEN", "ACTIVATION_REQUIRED", "VARIATION_COMMAND_CONFLICT", "VARIATION_REVISION_CONFLICT"]);

async function invoke(run: () => Promise<unknown>) {
  try { return NextResponse.json(await run(), { headers }); }
  catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    const code = (error as { code?: string })?.code ?? (error instanceof Error ? error.message : "");
    if (code === "ORIGIN_FORBIDDEN") return NextResponse.json({ code }, { status: 403, headers });
    if (code.startsWith("CHOICE_ALLOWANCE_")) {
      return NextResponse.json({ code }, { status: /CONFLICT|PENDING/u.test(code) ? 409 : 400, headers });
    }
    if (draftRefusals.has(code)) return NextResponse.json({ code: "CHOICE_ALLOWANCE_DRAFT_REFUSED" }, { status: 409, headers });
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers });
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  return invoke(async () => (await workspaceApplication()).choiceAllowances.read((await params).id));
}

export async function POST(request: Request, { params }: RouteContext) {
  return invoke(async () => {
    if (!isTrustedBrowserOrigin(request)) throw new Error("ORIGIN_FORBIDDEN");
    const raw: unknown = await request.json().catch(() => null);
    return (await workspaceApplication()).choiceAllowances.command((await params).id, raw as never);
  });
}
