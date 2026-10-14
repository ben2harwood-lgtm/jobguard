import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession,practiceFailure } from "../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers});
 try {return NextResponse.json(await (await workspaceApplication()).workState.get((await params).id,Object.fromEntries(new URL(request.url).searchParams)),{headers});}
 catch(error){
  const denied=practiceFailure(error);if(denied){denied.headers.set("Cache-Control","no-store");return denied;}
  const failure=(await workspaceApplication()).workState.failure(error);if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});throw error;
 }
}
