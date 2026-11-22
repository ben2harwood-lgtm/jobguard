import { routeErrorCode } from "../../../../lib/route-error-code";
import { practiceFailure } from "../../../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextResponse}from"next/server";import{hasSyntheticSession}from"../../../../lib/synthetic-server";import{workspaceApplication}from"../../../../lib/workspace-server";
const auth=async()=>hasSyntheticSession((await cookies()).get("jg_session")?.value);export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  if (globalThis.process?.env.JOBGUARD_ENV === "pilot_no_charge") {
    const { pilotWorkspaceRoute } = await import("../../../../lib/pilot-workspace-route.mjs");
    return pilotWorkspaceRoute(request, async app => app.finalAccount.read((await params).id));
  }
if(!await auth())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await workspaceApplication()).finalAccount.get((await params).id))}catch(e){const denied=practiceFailure(e);if(denied)return denied;return NextResponse.json({code:routeErrorCode(e,"DATABASE_UNAVAILABLE")},{status:400})}}export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){
  if (globalThis.process?.env.JOBGUARD_ENV === "pilot_no_charge") {
    const { pilotWorkspaceRoute } = await import("../../../../lib/pilot-workspace-route.mjs");
    return pilotWorkspaceRoute(r, async app => app.finalAccount.assemble((await params).id, await r.json().catch(() => null)));
  }
if(!await auth())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await workspaceApplication()).finalAccount.build((await params).id,await r.json()))}catch(e){const denied=practiceFailure(e);if(denied)return denied;const code=routeErrorCode(e,"DATABASE_UNAVAILABLE");return NextResponse.json({code},{status:code.includes("STALE")?409:400})}}
