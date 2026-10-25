import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createWorkspaceApplication } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
type Facade = { family(id:string):Promise<unknown>; view(id:string,query:unknown):Promise<unknown>; review(id:string,body:unknown):Promise<unknown> };
const statuses: Record<string,number> = { UNAUTHENTICATED:401, NOT_FOUND:404, SYNTHETIC_MODE_REQUIRED:403, INVALID_INTEGRITY_QUERY:400, INVALID_INTEGRITY_REVIEW:400, IDEMPOTENCY_CONFLICT:409, INTEGRITY_SOURCE_CHANGED:409, INTEGRITY_RETRY_REQUIRED:409, INTEGRITY_FAMILY_UNAVAILABLE:503, INTEGRITY_SOURCE_UNAVAILABLE:503, INTEGRITY_UNAVAILABLE:503 };
function json(body:unknown,status=200) { return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}}); }
/** Shared transport only. Coordinator installs the request-scoped workspace facade. */
async function integrityTransport(request:Request, params:Promise<{id:string}>, action:"family"|"view"|"review") {
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")return json({code:"SYNTHETIC_MODE_REQUIRED"},403);
 try {
  const sessionId=(await cookies()).get("jg_session")?.value;
  const application=createWorkspaceApplication({pool:syntheticPool(),sessionId}) as ReturnType<typeof createWorkspaceApplication> & {commercialIntegrityV3?:Facade};
  const facade=application.commercialIntegrityV3;
  // STOP: CH6-A shared composition is coordinator-owned; no alternate authority path.
  if(!facade)return json({code:"INTEGRITY_UNAVAILABLE"},503);
  const id=(await params).id.toLowerCase();
  if(action==="family")return json(await facade.family(id));
  if(action==="view") {
   const query:Record<string,unknown>=Object.create(null);
   for(const [key,value] of new URL(request.url).searchParams)query[key]=Object.hasOwn(query,key)?[query[key],value]:value;
   return json(await facade.view(id,query));
  }
  // Current authority before JSON parsing, then review independently reauthenticates.
  await facade.family(id);
  let body:unknown;
  try { body=await request.json(); } catch { return json({code:"INVALID_INTEGRITY_REVIEW"},400); }
  return json(await facade.review(id,body));
 } catch(error) {
  const candidate=typeof error==="object"&&error!==null&&"code" in error?String(error.code):"";
  const code=Object.hasOwn(statuses,candidate)?candidate:"INTEGRITY_UNAVAILABLE";
  return json({code},statuses[code]);
 }
}
export function GET(request:Request,{params}:{params:Promise<{id:string}>}) { return integrityTransport(request,params,"family"); }
