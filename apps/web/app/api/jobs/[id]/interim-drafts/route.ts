import { NextResponse } from "next/server";
import { interimDraftFailure } from "@jobguard/api/workspace";
import { identityCredentials } from "../../../../lib/identity-server";
import { interimDraftApplication } from "../../../../lib/interim-draft-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const application = interimDraftApplication();
    return NextResponse.json(await application.read(await identityCredentials(request), (await params).id), { headers });
  } catch (error) {
    const failure = interimDraftFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const application = interimDraftApplication();
    const raw: unknown = await request.json().catch(() => null);
    return NextResponse.json(await application.command(await identityCredentials(request), (await params).id, raw), { status: 201, headers });
  } catch (error) {
    const failure = interimDraftFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
