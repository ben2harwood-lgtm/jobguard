import { trialReply } from "../../../../../lib/trial-server";
import { routeErrorCode } from "../../../../../lib/route-error-code";
import { practiceFailure } from "../../../../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextResponse}from"next/server";import{hasSyntheticSession}from"../../../../../lib/synthetic-server";import{workspaceApplication}from"../../../../../lib/workspace-server";
const auth=async()=>hasSyntheticSession((await cookies()).get("jg_session")?.value);
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){if(!await auth())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await workspaceApplication()).quote.activationView((await params).id));}catch(e){const denied=practiceFailure(e);if(denied)return denied;return NextResponse.json({code:routeErrorCode(e,"DATABASE_UNAVAILABLE")},{status:400});}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const body=await request.clone().json().catch(()=>null);
// A signed-in owner may also hold a practice session, so the command's own version picks its path.
if((await cookies()).get("jobguard_session")?.value&&(body?.version==="trial-switch-live.v1"||!await auth()))return trialReply(request,(await params).id,"activate");if(!await auth())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await (await workspaceApplication()).quote.activate((await params).id,body));}catch(e){const denied=practiceFailure(e);if(denied)return denied;const code=routeErrorCode(e,"DATABASE_UNAVAILABLE");return NextResponse.json({code},{status:code.includes("CONFLICT")||code.includes("REQUIRED")?409:400});}}
