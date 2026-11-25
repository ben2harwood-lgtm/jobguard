import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {SnagApplication,jobSourceFailure,snagFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession,syntheticPool} from "../../../../lib/synthetic-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const refuse=(error:unknown)=>{const failure=snagFailure(error)??jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})};
async function session(){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")return {refused:refuse(new JobSourceError("SYNTHETIC_MODE_REQUIRED"))};
 const value=(await cookies()).get("jg_session")?.value;
 return hasSyntheticSession(value)?{value}:{refused:refuse(new PracticeAccessError("UNAUTHENTICATED"))};
}
/** QW-4: the job's snag list. Practice mode, same session and job checks as the diary. */
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 try{return NextResponse.json(await new SnagApplication(syntheticPool(),s.value).list((await params).id),{headers})}catch(error){return refuse(error)}
}
/** Add a snag, or revise its details. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 const raw=await request.json().catch(()=>null);
 try{return NextResponse.json(await new SnagApplication(syntheticPool(),s.value).save((await params).id,raw),{headers})}catch(error){return refuse(error)}
}
