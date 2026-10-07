import { practiceFailure } from "../../lib/synthetic-server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { workspaceApplication } from "../../lib/workspace-server";
import { tenantIdV1 } from "../../lib/contracts";
import { hasSyntheticSession, syntheticWorkspace } from "../../lib/synthetic-server";

export async function GET(request: NextRequest) {
  const cookie = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(cookie)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = tenantIdV1.safeParse(request.nextUrl.searchParams.get("tenantId"));
  let workspace: Awaited<ReturnType<typeof syntheticWorkspace>>;
  try { workspace = await syntheticWorkspace(); } catch (practiceError){const denied=practiceFailure(practiceError);if(denied)return denied; return NextResponse.json({ code: "DATABASE_UNAVAILABLE", recoverable: true }, { status: 503 }); }
  if (!parsed.success || !workspace.tenants.some(({ id }) => id === parsed.data)) return NextResponse.json({ code: "TENANT_FORBIDDEN" }, { status: 403 });
  const requestedJob = request.nextUrl.searchParams.get("jobId");
  if(parsed.data===workspace.tenants[0]?.id){
    try {
      const projected=await (await workspaceApplication()).parties.list({sessionId:cookie!});
      workspace.jobs=projected.jobs.map(job=>{
        const existing=workspace.jobs.find(value=>value.id===job.id);
        return {id:job.id,tenantId:parsed.data,title:job.title,status:job.status,customerLabel:job.customerLabel,siteLabel:job.siteLabel,updatedLabel:`Server revision ${job.revision}`,
          document:existing?.document??{kind:"unknown",reference:null,delivery:"unknown"},customerPayment:existing?.customerPayment??"unknown",pilotNoCharge:existing?.pilotNoCharge??false};
      });
    }
    catch(error){const denied=practiceFailure(error);if(denied)return denied;return NextResponse.json({code:"DATABASE_UNAVAILABLE",recoverable:true},{status:503});}
  }
  const visible = workspace.jobs.filter((job) => job.tenantId === parsed.data);
  if (requestedJob && !visible.some((job) => job.id === requestedJob)) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ version: 1, tenantId: parsed.data, jobs: requestedJob ? visible.filter((job) => job.id === requestedJob) : visible });
}
