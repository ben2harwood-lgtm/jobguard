import { NextResponse } from "next/server";
import { accountingExportFailure } from "@jobguard/api/accounting-export";
import { accountingExportApplication } from "../../../lib/accounting-export-server";
import { identityApplication, identityCredentials } from "../../../lib/identity-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ sourceId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const operation = new URL(request.url).searchParams.get("view");
    if (operation !== "preview" && operation !== "read") return NextResponse.json({ version: 1, code: "EXPORT_INVALID_INPUT" }, { status: 400, headers });
    return NextResponse.json(await accountingExportApplication().execute({ ...await identityCredentials(request),
      origin: request.headers.get("origin") ?? identityApplication().allowedOrigin }, (await params).sourceId, operation), { headers });
  } catch (error) {
    const failure = accountingExportFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    if (request.headers.get("origin") !== identityApplication().allowedOrigin)
      return NextResponse.json({ version: 1, code: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
    let raw: unknown;
    try { raw = await request.json(); } catch {
      return NextResponse.json({ version: 1, code: "EXPORT_INVALID_INPUT" }, { status: 400, headers });
    }
    return NextResponse.json(await accountingExportApplication().execute(await identityCredentials(request),
      (await params).sourceId, "approve", raw), { headers });
  } catch (error) {
    const failure = accountingExportFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
