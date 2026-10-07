import { practiceFailure } from "../../../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextResponse}from"next/server";import{CommercialIntegrityApplication}from"@jobguard/api/commercial-integrity";import{hasSyntheticSession,syntheticPool}from"../../../../lib/synthetic-server";

const auth=async()=>hasSyntheticSession((await cookies()).get("jg_session")?.value);
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){if(!await auth())return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{return NextResponse.json(await new CommercialIntegrityApplication(syntheticPool(),(await cookies()).get("jg_session")?.value,"synthetic_demo").view((await params).id),{headers:{"Cache-Control":"no-store"}})}catch(e){const denied=practiceFailure(e);if(denied)return denied;return NextResponse.json({code:e instanceof Error?e.message:"UNAVAILABLE"},{status:403})}}
