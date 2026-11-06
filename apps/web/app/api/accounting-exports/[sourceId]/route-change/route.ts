import { NextResponse } from "next/server";
import { accountingExportFailure } from "@jobguard/api/accounting-export";
import { routeApprovalV1 } from "@jobguard/api/accounting-export-contracts";
import { accountingExportApplication } from "../../../../lib/accounting-export-server";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ sourceId: string }> };
const refusal = (code: string, status: number) => NextResponse.json({ version: 1, code }, { status, headers });
export async function GET(request: Request, { params }: Context) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return refusal("EXPORT_FORBIDDEN", 403);
  if (new URL(request.url).search) return refusal("EXPORT_INVALID_INPUT", 400);
  try {
    return NextResponse.json(await accountingExportApplication().routeChange({ ...await identityCredentials(request),
      origin: request.headers.get("origin") ?? identityApplication().allowedOrigin }, (await params).sourceId, "read"), { headers });
  } catch (error) {
    const failure = accountingExportFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request, { params }: Context) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return refusal("EXPORT_FORBIDDEN", 403);
  if (request.headers.get("origin") !== identityApplication().allowedOrigin) return refusal("ORIGIN_FORBIDDEN", 403);
  if (new URL(request.url).search) return refusal("EXPORT_INVALID_INPUT", 400);
  try {
    let raw: unknown;
    try { raw = await request.json(); } catch { return refusal("EXPORT_INVALID_INPUT", 400); }
    const parsed = routeApprovalV1.safeParse(raw);
    if (!parsed.success) return refusal("EXPORT_INVALID_INPUT", 400);
    return NextResponse.json(await accountingExportApplication().routeChange(await identityCredentials(request),
      (await params).sourceId, "confirm", parsed.data), { headers });
  } catch (error) {
    const failure = accountingExportFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
