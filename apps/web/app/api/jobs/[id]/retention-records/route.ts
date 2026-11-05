import { NextResponse } from "next/server";
import { retentionRecordFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
import { retentionRecordApplication } from "../../../../lib/retention-record-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const application = retentionRecordApplication();
    const credentials = { ...await identityCredentials(request), origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    return NextResponse.json(await application.read(credentials, (await params).id), { headers });
  } catch (error) {
    const failure = retentionRecordFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const application = retentionRecordApplication();
    const credentials = await identityCredentials(request);
    identityApplication().requireOrigin(credentials.origin);
    const raw: unknown = await request.json().catch(() => null);
    return NextResponse.json(await application.command(credentials, (await params).id, raw), { status: 201, headers });
  } catch (error) {
    const failure = retentionRecordFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
