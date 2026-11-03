import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {jobSourceFailure} from "@jobguard/api/workspace";
import {hasSyntheticSession} from "../../../../lib/synthetic-server";
import {workspaceApplication} from "../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"){const failure=jobSourceFailure(new JobSourceError("SYNTHETIC_MODE_REQUIRED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value)){const failure=jobSourceFailure(new PracticeAccessError("UNAUTHENTICATED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 let raw:unknown;
 try{raw=await request.json()}catch{const failure=jobSourceFailure(new JobSourceError("INVALID_JOB_SOURCE_INPUT"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 try{return NextResponse.json(await (await workspaceApplication()).jobSources.importHistorical((await params).id,raw),{status:201,headers})}
 catch(error){const failure=jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})}
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"){const failure=jobSourceFailure(new JobSourceError("SYNTHETIC_MODE_REQUIRED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value)){const failure=jobSourceFailure(new PracticeAccessError("UNAUTHENTICATED"));return NextResponse.json(failure.body,{status:failure.status,headers})}
 try{return NextResponse.json(await (await workspaceApplication()).jobSources.historical((await params).id),{headers})}
 catch(error){const failure=jobSourceFailure(error);return NextResponse.json(failure.body,{status:failure.status,headers})}
}
