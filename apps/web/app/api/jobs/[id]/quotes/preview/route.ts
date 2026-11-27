import { routeErrorCode } from "../../../../../lib/route-error-code";
import { practiceFailure } from "../../../../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextResponse}from"next/server";import{hasSyntheticSession}from"../../../../../lib/synthetic-server";import{workspaceApplication}from"../../../../../lib/workspace-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if (process.env.JOBGUARD_ENV === "pilot_no_charge") {
  const { pilotWorkspaceRoute } = await import("../../../../../lib/pilot-workspace-route.mjs");
  return pilotWorkspaceRoute(request, async app => app.quote.preview((await params).id, await request.json().catch(() => null)));
 }
 const body=await request.json();if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await workspaceApplication()).quote.preview((await params).id,body));}catch(e){const denied=practiceFailure(e);if(denied)return denied;return NextResponse.json({code:routeErrorCode(e,"DATABASE_UNAVAILABLE")},{status:400});}}
