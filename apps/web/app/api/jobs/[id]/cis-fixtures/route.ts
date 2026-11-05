import { NextResponse } from "next/server";
import { cisFixtureFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
import { cisFixtureApplication } from "../../../../lib/cis-fixture-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const dark = () => process.env.JOBGUARD_ENV !== "synthetic_demo";
const unavailable = () => NextResponse.json({ code: "CIS_FIXTURE_NOT_FOUND", reason: "Job or statement unavailable." }, { status: 404, headers });
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (dark()) return unavailable();
  try {
    const credentials = { ...await identityCredentials(request), origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    const view = await cisFixtureApplication().read(credentials, (await params).id);
    return NextResponse.json(view, { status: view.code ? 404 : 200, headers });
  } catch (error) { const failure = cisFixtureFailure(error); return NextResponse.json(failure.body, { status: failure.status, headers }); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (dark()) return unavailable();
  try {
    const credentials = await identityCredentials(request);
    // The browser must supply the trusted Origin; never infer POST authority.
    credentials.origin = request.headers.get("origin") ?? undefined;
    return NextResponse.json(await cisFixtureApplication().command(credentials, (await params).id, await request.json().catch(() => null)), { status: 201, headers });
  } catch (error) { const failure = cisFixtureFailure(error); return NextResponse.json(failure.body, { status: failure.status, headers }); }
}
