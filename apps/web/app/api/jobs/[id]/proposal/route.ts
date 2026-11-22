import { practiceFailure } from "../../../../lib/synthetic-server";
import {cookies} from "next/headers";import {NextResponse}from"next/server";import{CaptureApplicationError}from"@jobguard/api/workspace";import{hasSyntheticSession}from"../../../../lib/synthetic-server";import{workspaceApplication}from"../../../../lib/workspace-server";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 if (process.env.JOBGUARD_ENV === "pilot_no_charge") {
  const { pilotWorkspaceRoute } = await import("../../../../lib/pilot-workspace-route.mjs");
  return pilotWorkspaceRoute(request, async app => app.capture.get((await params).id));
 }
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await workspaceApplication()).capture.get((await params).id))}catch(e){const denied=practiceFailure(e);if(denied)return denied;const code=e instanceof CaptureApplicationError?e.code:"DATABASE_UNAVAILABLE";return NextResponse.json({code},{status:code==="NOT_FOUND"?404:503})}}
