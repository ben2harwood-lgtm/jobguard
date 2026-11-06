import { NextResponse } from "next/server";
import { assertPayNowPreviewMode, payNowAttemptFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../../../lib/identity-server";
import { payNowAttemptApplication } from "../../../../../../lib/pay-now-attempt-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ id: string; invoiceId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    assertPayNowPreviewMode();
    const { id, invoiceId } = await params;
    const credentials = { ...await identityCredentials(request), origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    return NextResponse.json(await payNowAttemptApplication().read(credentials, id, invoiceId), { headers });
  } catch (error) {
    const failure = payNowAttemptFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    assertPayNowPreviewMode();
    const credentials = await identityCredentials(request);
    if (credentials.origin !== identityApplication().allowedOrigin) return NextResponse.json({ code: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
    const { id, invoiceId } = await params;
    const result = await payNowAttemptApplication().command(credentials, id, invoiceId, await request.json().catch(() => null));
    return NextResponse.json(result, { headers });
  } catch (error) {
    const failure = payNowAttemptFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
