import { NextResponse } from "next/server";
import { vatFixtureFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
import { vatFixtureApplication } from "../../../../lib/vat-fixture-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const application = vatFixtureApplication();
    const credentials = { ...await identityCredentials(request),
      origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    return NextResponse.json(await application.read(credentials, (await params).id), { headers });
  } catch (error) {
    const failure = vatFixtureFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const application = vatFixtureApplication();
    const raw: unknown = await request.json().catch(() => null);
    return NextResponse.json(await application.command(await identityCredentials(request), (await params).id, raw), { status: 201, headers });
  } catch (error) {
    const failure = vatFixtureFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
