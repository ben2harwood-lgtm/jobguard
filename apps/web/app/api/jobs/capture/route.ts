import { practiceFailure } from "../../../lib/synthetic-server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CaptureApplicationError } from "@jobguard/api/workspace";
import { CaptureConflictError } from "@jobguard/db";
import { hasSyntheticSession } from "../../../lib/synthetic-server";
import { workspaceApplication } from "../../../lib/workspace-server";
export async function POST(request:Request){
 if (process.env.JOBGUARD_ENV === "pilot_no_charge") {
  const { pilotWorkspaceRoute } = await import("../../../lib/pilot-workspace-route.mjs");
  return pilotWorkspaceRoute(request, async app => app.capture.create(await request.json().catch(() => null)), 201);
 }
 const body=await request.json().catch(()=>null);if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await workspaceApplication()).capture.create(body),{status:201})}catch(e){const denied=practiceFailure(e);if(denied)return denied;const code=e instanceof CaptureApplicationError||e instanceof CaptureConflictError?e.code:"DATABASE_UNAVAILABLE";return NextResponse.json({code,originalInputRetained:true},{status:code==="CAPTURE_ID_REUSED"?409:code==="TENANT_FORBIDDEN"?403:code==="DATABASE_UNAVAILABLE"?503:400})}}
