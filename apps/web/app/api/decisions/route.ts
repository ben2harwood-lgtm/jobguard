import { PracticeAccessError } from "@jobguard/db";
import { isRouteValidationError } from "../../lib/route-error-code";
import { practiceFailure } from "../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextRequest,NextResponse}from"next/server";import{hasSyntheticSession}from"../../lib/synthetic-server";import{workspaceApplication}from"../../lib/workspace-server";
async function authenticated(){return hasSyntheticSession((await cookies()).get("jg_session")?.value)}
function failure(error: unknown) {
  if (isRouteValidationError(error)) return NextResponse.json({ code: "INVALID_COMMAND" }, { status: 400 });
  // Only established public refusals may cross this HTTP boundary.
  if (error instanceof Error) {
    switch (error.message) {
      case "FORBIDDEN": return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
      case "NOT_FOUND": return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
      case "CONFLICT": return NextResponse.json({ code: "CONFLICT" }, { status: 409 });
      case "INVALID_COMMAND": return NextResponse.json({ code: "INVALID_COMMAND" }, { status: 400 });
    }
  }
  return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
}
export async function GET(request: NextRequest) {
  if (!await authenticated()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const explicitJob = request.nextUrl.searchParams.get("jobId");
  const requestedJob = explicitJob ?? (await cookies()).get("jg_decision_job")?.value;
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  try {
    const { decisions } = await workspaceApplication();
    let result;
    let staleFilter = false;
    try {
      result = await decisions.list({ tenantId, ...(requestedJob ? { jobId: requestedJob } : {}) });
    } catch (error) {
      // Only an implicit filter's ownership refusal can recover. The same service
      // rechecks the session and tenant before listing its allowed inbox.
      if (explicitJob !== null || !requestedJob || !(error instanceof PracticeAccessError) || error.code !== "NOT_FOUND") throw error;
      result = await decisions.list({ tenantId });
      staleFilter = true;
    }
    const response = NextResponse.json(result);
    if (staleFilter) response.cookies.delete("jg_decision_job");
    return response;
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!await authenticated()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try {
    let body;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) return NextResponse.json({ code: "INVALID_COMMAND" }, { status: 400 });
      throw error;
    }
    const { decisions } = await workspaceApplication();
    const result = body?.version === "finding-evaluation-command.v1"
      ? await decisions.evaluate(body) : await decisions.dismiss(body);
    const response = NextResponse.json(result);
    if (body?.version === "finding-evaluation-command.v1") response.cookies.set("jg_decision_job", body.jobId, {
      httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/",
    });
    return response;
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    return failure(error);
  }
}
