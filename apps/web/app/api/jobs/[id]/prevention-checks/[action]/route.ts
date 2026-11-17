import { NextResponse } from "next/server";
import { PreventionCheckError } from "@jobguard/core";
import { preventionHttpStatus } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
import { practiceFailure } from "../../../../../lib/synthetic-server";
export async function POST(request: Request,{params}:{params:Promise<{id:string;action:string}>}) {
  try {
    const {id,action}=await params;
    // Malformed JSON is still authenticated by the shared application boundary.
    const raw:unknown=await request.json().catch(()=>null);
    return NextResponse.json(await (await workspaceApplication()).preventionChecks.command(id,raw,action),{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    const denied=practiceFailure(error);if(denied)return denied;
    return NextResponse.json({code:error instanceof PreventionCheckError?error.code:"PREVENTION_UNAVAILABLE"},{status:error instanceof PreventionCheckError?preventionHttpStatus(error.code):503,headers:{"Cache-Control":"no-store"}});
  }
}
