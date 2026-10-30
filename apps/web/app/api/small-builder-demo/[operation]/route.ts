import { NextResponse } from "next/server";
import { SmallBuilderDemoError } from "@jobguard/db";
import { smallBuilderDemoHttpCommandV1, smallBuilderDemoReadRunV1, smallBuilderDemoReadReportV1 } from "@jobguard/core";
import { identityApplication, identityCredentials } from "../../../lib/identity-server";
import { smallBuilderDemoApplication } from "../../../lib/small-builder-demo-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ operation: string }> };
function failure(error: unknown) {
  const code = error instanceof SmallBuilderDemoError ? error.code : "DEMO_UNAVAILABLE";
  const status = code === "INVALID_DEMO_INPUT" ? 400 : code === "DEMO_FORBIDDEN" || code === "DEMO_SYNTHETIC_ONLY" ? 403
    : code === "DEMO_NOT_FOUND" ? 404 : ["DEMO_STALE_REVISION", "DEMO_ARCHIVED", "DEMO_COMMAND_CONFLICT"].includes(code) ? 409 : 503;
  return NextResponse.json({ version: "small-builder-demo-error.v1", code }, { status, headers });
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
    const parsed = smallBuilderDemoHttpCommandV1.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.operation !== operation || new URL(request.url).search) throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
    const command = parsed.data;
    return NextResponse.json(await smallBuilderDemoApplication().execute(await identityCredentials(request), command.operation, command.runId, command.input), { status: 201, headers });
  } catch (error) { return failure(error); }
}
