import { identityStatus } from "@jobguard/api/identity";
import { smallBuilderDemoHttpFailure } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { SmallBuilderDemoError } from "@jobguard/db";
import { trialDemoCommandV1, smallBuilderDemoHttpCommandV1, smallBuilderDemoReadRunV1, smallBuilderDemoReadReportV1 } from "@jobguard/core";
import { identityApplication, identityCredentials } from "../../../lib/identity-server";
import { smallBuilderDemoApplication, smallBuilderTrialDemoApplication } from "../../../lib/small-builder-demo-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ operation: string }> };
function failure(error:unknown) {
  const result=smallBuilderDemoHttpFailure(error);
  return NextResponse.json(result.body,{status:result.status,headers});
}
export async function GET(request: Request, context: Context) {
  try {
    const { operation } = await context.params;
    if (operation !== "read" && operation !== "report") throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
    const query = new URL(request.url).searchParams;
    // Reject duplicate parameters rather than silently choosing a different subject.
    if ([...query.keys()].some(key => query.getAll(key).length !== 1)) throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
    const parsed = (operation === "read" ? smallBuilderDemoReadRunV1 : smallBuilderDemoReadReportV1).safeParse(Object.fromEntries(query));
    if (!parsed.success) throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
    const { runId, ...input } = parsed.data;
    const credentials = { ...await identityCredentials(request), origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    return NextResponse.json(await smallBuilderDemoApplication().execute(credentials, operation, runId, input), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { operation } = await context.params;
    if(operation === "trial") {
      const credentials=await identityCredentials(request);
      try {await identityApplication().context(credentials);} catch(error) {
        const failure=identityStatus(error);
        return NextResponse.json({code:failure.code},{status:failure.status,headers});
      }
      const input=trialDemoCommandV1.safeParse(await request.json().catch(()=>null));
      if(!input.success || new URL(request.url).search)throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
      return NextResponse.json(await smallBuilderTrialDemoApplication().execute(credentials,input.data),{headers});
    }
    const parsed = smallBuilderDemoHttpCommandV1.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.operation !== operation || new URL(request.url).search) throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
    const command = parsed.data;
    return NextResponse.json(await smallBuilderDemoApplication().execute(await identityCredentials(request), command.operation, command.runId, command.input), { status: 201, headers });
  } catch (error) { return failure(error); }
}
