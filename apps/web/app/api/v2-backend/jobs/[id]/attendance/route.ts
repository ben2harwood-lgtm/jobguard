import { SiteAttendanceError } from "@jobguard/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession, practiceFailure } from "../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../../contractor/origin";
import { workspaceApplication } from "../../../../../lib/workspace-server";

export const dynamic = "force-dynamic";
type Route = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };

function failure(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers });
}

const statuses: Record<SiteAttendanceError["code"], number> = {
  SITE_ATTENDANCE_INVALID: 400, SITE_ATTENDANCE_DAY_OUT_OF_RANGE: 400, CREW_CONTACT_UNAVAILABLE: 422,
  SITE_ATTENDANCE_VERSION_CONFLICT: 409, SITE_ATTENDANCE_COMMAND_CONFLICT: 409, SITE_ATTENDANCE_EDITOR_REQUIRED: 403,
};

function refusal(error: unknown) {
  if (error instanceof SiteAttendanceError) {
    return failure(error.code === "SITE_ATTENDANCE_EDITOR_REQUIRED" ? "FORBIDDEN" : error.code, statuses[error.code]);
  }
  return practiceFailure(error) ?? failure("SITE_ATTENDANCE_UNAVAILABLE", 503);
}

async function signedIn() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return failure("UNAUTHENTICATED", 401);
  return null;
}

// V2-F8, V2 only. The builder's on-site taps for this job: today and the six days before.
// The application confirms this firm can see the job before it reads anything.
export async function GET(_request: Request, { params }: Route) {
  const refused = await signedIn();
  if (refused) return refused;
  try {
    const view = await (await workspaceApplication()).siteAttendance.list((await params).id,
      { version: "v2-site-attendance-query.v1" });
    return NextResponse.json(view, { headers });
  } catch (error) {
    return refusal(error);
  }
}

// One tap. The body is the strict v2-site-attendance-command.v1, so a location, device or
// any other extra field is refused, never stored.
export async function POST(request: Request, { params }: Route) {
  const refused = await signedIn();
  if (refused) return refused;
  // Rule 21: configured origins only, never the request URL or forwarded headers.
  if (!isTrustedBrowserOrigin(request)) return failure("ORIGIN_FORBIDDEN", 403);
  let body: unknown;
  try { body = await request.json(); } catch { return failure("SITE_ATTENDANCE_INVALID", 400); }
  try {
    const record = await (await workspaceApplication()).siteAttendance.record((await params).id, body);
    return NextResponse.json(record, { status: 201, headers });
  } catch (error) {
    return refusal(error);
  }
}
