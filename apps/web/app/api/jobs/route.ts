import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { tenantIdV1 } from "../../lib/contracts";
import { hasSyntheticSession, syntheticWorkspace } from "../../lib/synthetic-server";

export async function GET(request: NextRequest) {
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = tenantIdV1.safeParse(request.nextUrl.searchParams.get("tenantId"));
  let workspace: Awaited<ReturnType<typeof syntheticWorkspace>>;
  try { workspace = await syntheticWorkspace(); } catch { return NextResponse.json({ code: "DATABASE_UNAVAILABLE", recoverable: true }, { status: 503 }); }
  if (!parsed.success || !workspace.tenants.some(({ id }) => id === parsed.data)) return NextResponse.json({ code: "TENANT_FORBIDDEN" }, { status: 403 });
  const requestedJob = request.nextUrl.searchParams.get("jobId");
  const visible = workspace.jobs.filter((job) => job.tenantId === parsed.data);
  if (requestedJob && !visible.some((job) => job.id === requestedJob)) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ version: 1, tenantId: parsed.data, jobs: requestedJob ? visible.filter((job) => job.id === requestedJob) : visible });
}
