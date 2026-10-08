import { NextResponse } from "next/server";
import { PreventionCheckError } from "@jobguard/core";
import { preventionHttpStatus } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";
export async function GET(_request: Request,{params}:{params:Promise<{id:string}>}) {
  try { return NextResponse.json(await (await workspaceApplication()).preventionChecks.view((await params).id),{headers:{"Cache-Control":"no-store"}}); }
  catch (error) {
    const denied=practiceFailure(error);if(denied)return denied;
    return NextResponse.json({code:error instanceof PreventionCheckError?error.code:"PREVENTION_UNAVAILABLE"},{status:error instanceof PreventionCheckError?preventionHttpStatus(error.code):503,headers:{"Cache-Control":"no-store"}});
  }
}
