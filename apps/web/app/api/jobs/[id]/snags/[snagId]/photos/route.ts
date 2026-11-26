import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {SnagApplication,jobSourceFailure,snagFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession,syntheticPool} from "../../../../../../lib/synthetic-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const refuse=(error:unknown)=>{const failure=snagFailure(error)??jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})};
/** QW-4: a photo on a snag, through the verified begin/finalize upload (generated practice photos). Practice mode only. */
export async function POST(request:Request,{params}:{params:Promise<{id:string;snagId:string}>}){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")return refuse(new JobSourceError("SYNTHETIC_MODE_REQUIRED"));
 const session=(await cookies()).get("jg_session")?.value;
 if(!hasSyntheticSession(session))return refuse(new PracticeAccessError("UNAUTHENTICATED"));
 const raw=await request.json().catch(()=>null),{id,snagId}=await params;
 try{return NextResponse.json(await new SnagApplication(syntheticPool(),session).photo(id,snagId,raw),{headers})}catch(error){return refuse(error)}
}
