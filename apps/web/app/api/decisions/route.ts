import { routeErrorCode } from "../../lib/route-error-code";
import { practiceFailure } from "../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextRequest,NextResponse}from"next/server";import{hasSyntheticSession}from"../../lib/synthetic-server";import{workspaceApplication}from"../../lib/workspace-server";
async function authenticated(){return hasSyntheticSession((await cookies()).get("jg_session")?.value)}
const failure=(error:unknown)=>{const code=routeErrorCode(error,"DATABASE_UNAVAILABLE");return NextResponse.json({code},{status:code==="FORBIDDEN"?403:code==="NOT_FOUND"?404:code==="CONFLICT"?409:400});};
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
      // practiceFailure returns 404 only for a typed PracticeAccessError NOT_FOUND.
      if (explicitJob !== null || !requestedJob || practiceFailure(error)?.status !== 404) throw error;
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
export async function POST(request:Request){const body=await request.json();if(!await authenticated())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{const result=body.version==="finding-evaluation-command.v1"?await (await workspaceApplication()).decisions.evaluate(body):await (await workspaceApplication()).decisions.dismiss(body);const response=NextResponse.json(result);if(body.version==="finding-evaluation-command.v1")response.cookies.set("jg_decision_job",body.jobId,{httpOnly:true,sameSite:"lax",secure:new URL(request.url).protocol==="https:",path:"/"});return response;}catch(error){const denied=practiceFailure(error);if(denied)return denied;return failure(error)}}
