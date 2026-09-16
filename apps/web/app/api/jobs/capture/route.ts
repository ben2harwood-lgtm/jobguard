import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CaptureApplicationError } from "@jobguard/api/workspace";
import { hasSyntheticSession } from "../../../lib/synthetic-server";
import { workspaceApplication } from "../../../lib/workspace-server";
export async function POST(request:Request){const body=await request.json().catch(()=>null);if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await workspaceApplication().capture.create(body),{status:201})}catch(e){const code=e instanceof CaptureApplicationError?e.code:"DATABASE_UNAVAILABLE";return NextResponse.json({code,originalInputRetained:true},{status:code==="TENANT_FORBIDDEN"?403:code==="DATABASE_UNAVAILABLE"?503:400})}}
