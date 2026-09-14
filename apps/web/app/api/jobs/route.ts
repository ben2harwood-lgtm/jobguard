import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { tenantIdV1 } from "../../lib/contracts";
import { hasSyntheticSession, isMember, tenantJobs } from "../../lib/synthetic-server";

export async function GET(request: NextRequest) {
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = tenantIdV1.safeParse(request.nextUrl.searchParams.get("tenantId"));
  if (!parsed.success || !isMember(parsed.data)) return NextResponse.json({ code: "TENANT_FORBIDDEN" }, { status: 403 });
  const requestedJob = request.nextUrl.searchParams.get("jobId");
  const visible = tenantJobs(parsed.data);
  if (requestedJob && !visible.some((job) => job.id === requestedJob)) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ version: 1, tenantId: parsed.data, jobs: requestedJob ? visible.filter((job) => job.id === requestedJob) : visible });
}
