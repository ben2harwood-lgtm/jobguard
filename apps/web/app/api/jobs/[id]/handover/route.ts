import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {HandoverApplication,handoverFailure,jobSourceFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession,syntheticPool} from "../../../../lib/synthetic-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const refuse=(error:unknown)=>{const failure=handoverFailure(error)??jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})};
async function session(){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"||process.env.JOBGUARD_LOCAL_V2!=="1")return {refused:refuse(new JobSourceError("SYNTHETIC_MODE_REQUIRED"))};
 const value=(await cookies()).get("jg_session")?.value;
 return hasSyntheticSession(value)?{value}:{refused:refuse(new PracticeAccessError("UNAUTHENTICATED"))};
}
/** V2-G2: what the builder can put in the handover pack, and every saved version. Same gates as the snag register. */
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 try{return NextResponse.json(await new HandoverApplication(syntheticPool(),s.value).read((await params).id),{headers})}catch(error){return refuse(error)}
}
/** Preview (writes nothing) or save a version, by `version`. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 const raw=await request.json().catch(()=>null);
 try{return NextResponse.json(await new HandoverApplication(syntheticPool(),s.value).command((await params).id,raw),{headers})}catch(error){return refuse(error)}
}
