import { NextResponse } from "next/server";
import { CompanyJobImportV3Application, meterTodayFailure } from "@jobguard/api/workspace";
import { JobImportV3Repository, JobImportV3Error, CommandError } from "@jobguard/db";
import { ImportContractError } from "@jobguard/core";
import { identityApplication, identityCredentials } from "../../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../../lib/synthetic-server";
import { importV3Failure } from "../../../../../../lib/job-import-v3-error";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; action: string }> };
async function execute(request: Request, context: Context, method: "GET" | "POST") {
  const { id, action } = await context.params;
  if (!(method === "GET" ? ["source", "read"] : ["preview", "adopt", "catch"]).includes(action))
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const identity = identityApplication();
    const credentials = { ...await identityCredentials(request), origin: request.headers.get("origin") ?? (method === "GET" ? identity.allowedOrigin : undefined) };
    const app = new CompanyJobImportV3Application(identity, new JobImportV3Repository(syntheticPool()));
    const result = await app.run(credentials, id, action as "source" | "read" | "preview" | "adopt" | "catch", method === "POST" ? await request.json().catch(() => null) : undefined);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof JobImportV3Error || error instanceof CommandError || error instanceof ImportContractError) return importV3Failure(error);
    const failure = meterTodayFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = (request: Request, context: Context) => execute(request, context, "GET");
export const POST = (request: Request, context: Context) => execute(request, context, "POST");
