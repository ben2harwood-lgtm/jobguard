import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createContractorApplication, contractorHttpStatus } from "@jobguard/api/workspace";
import { syntheticPool } from "../../lib/synthetic-server";
const principal=async()=>({version:"contractor-principal.v1",sessionId:(await cookies()).get("jg_session")?.value});
export async function GET(request:Request) {
 try {
  const application=createContractorApplication({pool:syntheticPool()}); const p=await principal();const url=new URL(request.url);
  const tenantId=url.searchParams.get('tenantId');
  return NextResponse.json(tenantId?await application.read(p,{version:"contractor-query.v1",tenantId,resource:url.searchParams.get('resource')??'organisation',...(url.searchParams.get('id')?{id:url.searchParams.get('id')}:{})}):await application.resume(p),{headers:{'cache-control':'no-store'}});
 }catch(error){return failure(error);}
}
export async function POST(request:Request) {
 if(request.headers.get("origin")!==new URL(request.url).origin) return NextResponse.json({code:"FORBIDDEN"},{status:403});
 try {
  const application=createContractorApplication({pool:syntheticPool()}); const p=await principal();const body:unknown=await request.json();
  return NextResponse.json(new URL(request.url).searchParams.get('action')==='start'?await application.start(p,body):await application.command(p,body));
 }catch(error){return failure(error);}
}
function failure(error:unknown) {const status=contractorHttpStatus(error);return NextResponse.json({version:"contractor-error.v1",code:status===503?"DATABASE_UNAVAILABLE":(error as {code:string}).code,recoverable:status===503},{status});}
