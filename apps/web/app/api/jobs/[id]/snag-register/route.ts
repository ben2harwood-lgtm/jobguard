import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {SnagRegisterApplication,jobSourceFailure,snagRegisterFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession,syntheticPool} from "../../../../lib/synthetic-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const refuse=(error:unknown)=>{const failure=snagRegisterFailure(error)??jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})};
async function session(){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"||process.env.JOBGUARD_LOCAL_V2!=="1")return {refused:refuse(new JobSourceError("SYNTHETIC_MODE_REQUIRED"))};
 const value=(await cookies()).get("jg_session")?.value;
 return hasSyntheticSession(value)?{value}:{refused:refuse(new PracticeAccessError("UNAUTHENTICATED"))};
}
/** V2-G1: the snag register (main's snag list with owner, people and agreed marks). Same gates as main's snag route. */
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 try{return NextResponse.json(await new SnagRegisterApplication(syntheticPool(),s.value).read((await params).id),{headers})}catch(error){return refuse(error)}
}
/** Set the owner, record an event with its person, or mark agreed outstanding, by `version`. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if("refused" in s)return s.refused;
 const raw=await request.json().catch(()=>null);
 try{return NextResponse.json(await new SnagRegisterApplication(syntheticPool(),s.value).command((await params).id,raw),{headers})}catch(error){return refuse(error)}
}
