import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {VariationRegisterApplication,jobSourceFailure,variationRegisterFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession,syntheticPool} from "../../lib/synthetic-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
/** QW-3: the weekly extras register as JSON (week = its closing Friday; default the latest closed week). Practice mode only. */
export async function GET(request:Request){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"){const failure=jobSourceFailure(new JobSourceError("SYNTHETIC_MODE_REQUIRED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 const session=(await cookies()).get("jg_session")?.value;
 if(!hasSyntheticSession(session)){const failure=jobSourceFailure(new PracticeAccessError("UNAUTHENTICATED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 try{return NextResponse.json(await new VariationRegisterApplication(syntheticPool(),session).read(Object.fromEntries(new URL(request.url).searchParams)),{headers})}
 catch(error){const failure=variationRegisterFailure(error)??jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})}
}
