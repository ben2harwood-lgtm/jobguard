import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession,practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers});
 let raw:unknown;
 try{raw=await request.json();}catch{return NextResponse.json({code:"INVALID_FINAL_CHECK_INPUT"},{status:400,headers});}
 try{return NextResponse.json(await (await workspaceApplication()).finalCheck.disposition((await params).id,raw),{status:201,headers});}
 catch(error){
  const denied=practiceFailure(error);if(denied){denied.headers.set("Cache-Control","no-store");return denied;}
  const failure=(await workspaceApplication()).finalCheck.failure(error);if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});throw error;
 }
}
