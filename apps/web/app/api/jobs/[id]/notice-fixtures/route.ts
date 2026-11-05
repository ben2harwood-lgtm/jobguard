import { NextResponse } from "next/server";
import { noticeFixtureFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
import { noticeFixtureApplication } from "../../../../lib/notice-fixture-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const application = noticeFixtureApplication();
    const credentials = { ...await identityCredentials(request),
      origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    const { id } = await params;
    return NextResponse.json(await application.read(credentials, id, new URL(request.url).searchParams.get("noticeId") ?? id), { headers });
  } catch (error) {
    const failure = noticeFixtureFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const application = noticeFixtureApplication();
    return NextResponse.json(await application.command(await identityCredentials(request), (await params).id,
      await request.json().catch(() => null)), { status: 201, headers });
  } catch (error) {
    const failure = noticeFixtureFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
