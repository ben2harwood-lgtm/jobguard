import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {jobSourceFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession} from "../../../../lib/synthetic-server";
import {workspaceApplication} from "../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
/** Read only. No held source-creation route is exported. */
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"){const failure=jobSourceFailure(new JobSourceError("SYNTHETIC_MODE_REQUIRED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value)){const failure=jobSourceFailure(new PracticeAccessError("UNAUTHENTICATED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 try{return NextResponse.json(await (await workspaceApplication()).jobSources.messages((await params).id,Object.fromEntries(new URL(request.url).searchParams)),{headers})}
 catch(error){const failure=jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})}
}
