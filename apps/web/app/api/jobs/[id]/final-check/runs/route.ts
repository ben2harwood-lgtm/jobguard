import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession,practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
/** Practice only: records a run request for the worker; this route never touches shadow data. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers});
 try{return NextResponse.json(await (await workspaceApplication()).finalCheck.requestRun((await params).id,await request.json().catch(()=>null)),{status:201,headers});}
 catch(error){
  const denied=practiceFailure(error);if(denied){denied.headers.set("Cache-Control","no-store");return denied;}
  const failure=(await workspaceApplication()).finalCheck.failure(error);if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});throw error;
 }
}
