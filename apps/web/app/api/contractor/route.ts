import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createContractorApplication, contractorHttpStatus } from "@jobguard/api/workspace";
import { syntheticPool } from "../../lib/synthetic-server";
// Browser same-origin check. Next reports request.url with a normalised host (127.0.0.1 becomes localhost), so compare the
// Origin header with the host and protocol the client actually addressed (Host / X-Forwarded-*), never with request.url's host.
function sameOrigin(request:Request) {
 const first=(name:string)=>request.headers.get(name)?.split(",")[0]?.trim()||null;
 const origin=request.headers.get("origin"),host=first("x-forwarded-host")??first("host"),proto=first("x-forwarded-proto")??new URL(request.url).protocol.slice(0,-1);
 if(!origin||!host) return false;
 try {const o=new URL(origin);return o.host===host&&o.protocol===`${proto}:`;}catch{return false;}
}
const principal=async()=>({version:"contractor-principal.v1",sessionId:(await cookies()).get("jg_session")?.value});
export async function GET(request:Request) {
 try {
  const application=createContractorApplication({pool:syntheticPool()}); const p=await principal();const url=new URL(request.url);
  const tenantId=url.searchParams.get('tenantId');
  return NextResponse.json(tenantId?await application.read(p,{version:"contractor-query.v1",tenantId,resource:url.searchParams.get('resource')??'organisation',...(url.searchParams.get('id')?{id:url.searchParams.get('id')}:{})}):await application.resume(p),{headers:{'cache-control':'no-store'}});
 }catch(error){return failure(error);}
}
export async function POST(request:Request) {
 if(!sameOrigin(request)) return NextResponse.json({code:"FORBIDDEN"},{status:403});
 try {
  const application=createContractorApplication({pool:syntheticPool()}); const p=await principal();const body:unknown=await request.json();
  return NextResponse.json(new URL(request.url).searchParams.get('action')==='start'?await application.start(p,body):await application.command(p,body));
 }catch(error){return failure(error);}
}
function failure(error:unknown) {const status=contractorHttpStatus(error);return NextResponse.json({version:"contractor-error.v1",code:status===503?"DATABASE_UNAVAILABLE":(error as {code:string}).code,recoverable:status===503},{status});}
