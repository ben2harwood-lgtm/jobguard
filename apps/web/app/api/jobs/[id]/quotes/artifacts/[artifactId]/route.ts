import { tenantIdV1 } from "../../../../../../lib/contracts";
import { practiceFailure } from "../../../../../../lib/synthetic-server";
import{cookies}from"next/headers";import{NextResponse}from"next/server";import{hasSyntheticSession}from"../../../../../../lib/synthetic-server";import{workspaceApplication}from"../../../../../../lib/workspace-server";
export async function GET(request:Request,{params}:{params:Promise<{id:string;artifactId:string}>}){
 if (process.env.JOBGUARD_ENV === "pilot_no_charge") {
  const { pilotWorkspaceRoute } = await import("../../../../../../lib/pilot-workspace-route.mjs");
  return pilotWorkspaceRoute(request, async app => {
   const { id, artifactId } = await params;
   if (!tenantIdV1.safeParse(artifactId).success) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
   const artifact = await app.quote.pdf(id, artifactId);
   return new NextResponse(artifact.pdf, { headers: {
     "content-type": "application/pdf", "content-disposition": `attachment; filename=quote-v${artifact.version}.pdf`,
     "x-jobguard-content-hash": artifact.hash, "x-jobguard-document-version": String(artifact.version),
   } });
  });
 }
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});try{const{id,artifactId}=await params,x=await (await workspaceApplication()).quote.pdf(id,artifactId);return new NextResponse(x.pdf,{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename=quote-v${x.version}.pdf`,"x-jobguard-content-hash":x.hash,"x-jobguard-document-version":String(x.version)}});}catch(practiceError){const denied=practiceFailure(practiceError);if(denied)return denied;return NextResponse.json({code:"NOT_FOUND"},{status:404});}}
