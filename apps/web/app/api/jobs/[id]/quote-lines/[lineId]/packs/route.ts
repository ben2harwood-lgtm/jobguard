import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {QuoteLinePacksApplication,jobSourceFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession,syntheticPool} from "../../../../../../lib/synthetic-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
/** QW-6: packs to order for one quote line (pack-count.v1). Practice mode, read only; nothing about the pack is saved. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;lineId:string}>}){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"){const failure=jobSourceFailure(new JobSourceError("SYNTHETIC_MODE_REQUIRED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 const session=(await cookies()).get("jg_session")?.value;
 if(!hasSyntheticSession(session)){const failure=jobSourceFailure(new PracticeAccessError("UNAUTHENTICATED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 const {id,lineId}=await params;
 try{return NextResponse.json(await new QuoteLinePacksApplication(syntheticPool(),session).read(id,lineId,Object.fromEntries(new URL(request.url).searchParams)),{headers})}
 catch(error){const failure=jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})}
}
