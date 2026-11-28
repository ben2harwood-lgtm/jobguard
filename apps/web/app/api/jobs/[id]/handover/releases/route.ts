import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {HandoverReleaseApplication,handoverReleaseFailure,jobSourceFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession,syntheticPool} from "../../../../../lib/synthetic-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const refuse=(error:unknown)=>{const failure=handoverReleaseFailure(error)??jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})};
async function session(){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"||process.env.JOBGUARD_LOCAL_V2!=="1")return {refused:refuse(new JobSourceError("SYNTHETIC_MODE_REQUIRED"))};
 const value=(await cookies()).get("jg_session")?.value;
 return hasSyntheticSession(value)?{value}:{refused:refuse(new PracticeAccessError("UNAUTHENTICATED"))};
}
/** V2-G3: every release of a saved handover version, with its receipt, and whether the site work is complete. G2's gates. */
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 try{return NextResponse.json(await new HandoverReleaseApplication(syntheticPool(),s.value).read((await params).id),{headers})}catch(error){return refuse(error)}
}
/** Release one saved version by customer link. The link is returned once. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 const raw=await request.json().catch(()=>null);
 try{return NextResponse.json(await new HandoverReleaseApplication(syntheticPool(),s.value).command((await params).id,raw),{headers})}catch(error){return refuse(error)}
}
