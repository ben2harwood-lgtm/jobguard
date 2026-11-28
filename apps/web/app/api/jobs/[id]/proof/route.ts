import { JobWorkStateError } from "@jobguard/core";
import { practiceFailure } from "../../../../lib/synthetic-server";
import { enforcePracticePair } from "../../../../lib/linked-practice-entry";
import { syntheticPool } from "../../../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextResponse}from"next/server";import{hasSyntheticSession}from"../../../../lib/synthetic-server";import{workspaceApplication}from"../../../../lib/workspace-server";
const authorized=async()=>hasSyntheticSession((await cookies()).get("jg_session")?.value);
// V2-AUTH-1 (Q81): on the local V2 stack a linked builder's proof goes through the V2 path, after the exact
// browser pairing check every V2 route makes. Main's path is unchanged everywhere else.
const proofApplication=async()=>{const workspace=await workspaceApplication();if(process.env.JOBGUARD_LOCAL_V2!=="1")return workspace.proof;await enforcePracticePair(syntheticPool(),(await cookies()).get("jg_session")?.value);return workspace.v2Proof};
const v2Refusal=(error:unknown)=>{const code=typeof error==="object"&&error&&"code"in error?String(error.code):"";return code==="V2_PROOF_STATEMENT_UNAVAILABLE"||code==="V2_PROOF_ACTION_UNAVAILABLE"?NextResponse.json({code,message:(error as Error).message},{status:409,headers:{"Cache-Control":"no-store"}}):null};const failure=(error:unknown)=>{const code=typeof error==="object"&&error&&"code"in error?String(error.code):"UNAVAILABLE";return NextResponse.json({code},{status:code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code==="INVALID_COMMAND"?400:code==="NOT_FOUND"?404:code==="FORBIDDEN"?403:code==="IDEMPOTENCY_CONFLICT"||code==="CONFLICT"||code==="COMMAND_CONFLICT"?409:code==="PROOF_STATEMENT_FROZEN"?409:code==="PROOF_SCHEMA_UNAVAILABLE"?503:code==="PROOF_INVALID"?422:500})};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  if (globalThis.process?.env.JOBGUARD_ENV === "pilot_no_charge") {
    const { pilotWorkspaceRoute } = await import("../../../../lib/pilot-workspace-route.mjs");
    return pilotWorkspaceRoute(request, async app => app.continuation.proof((await params).id, new URL(request.url).searchParams.get("evidenceId") ?? undefined));
  }
if(!await authorized())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await proofApplication()).get((await params).id))}catch(error){const workFailure=error instanceof JobWorkStateError?(await workspaceApplication()).workState.failure(error):null;if(workFailure)return NextResponse.json(workFailure.body,{status:workFailure.status,headers:{"Cache-Control":"no-store"}});const denied=practiceFailure(error);if(denied)return denied;return failure(error)}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if (globalThis.process?.env.JOBGUARD_ENV === "pilot_no_charge") {
    const { pilotWorkspaceRoute } = await import("../../../../lib/pilot-workspace-route.mjs");
    return pilotWorkspaceRoute(request, async app => app.continuation.saveProof((await params).id, await request.json().catch(() => null)));
  }
if(!await authorized())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});const body=await request.json().catch(()=>null);if(body===null)return NextResponse.json({code:"INVALID_COMMAND"},{status:400});try{return NextResponse.json(await (await proofApplication()).command((await params).id,body))}catch(error){const refused=v2Refusal(error);if(refused)return refused;const workFailure=error instanceof JobWorkStateError?(await workspaceApplication()).workState.failure(error):null;if(workFailure)return NextResponse.json(workFailure.body,{status:workFailure.status,headers:{"Cache-Control":"no-store"}});const denied=practiceFailure(error);if(denied)return denied;return failure(error)}}
