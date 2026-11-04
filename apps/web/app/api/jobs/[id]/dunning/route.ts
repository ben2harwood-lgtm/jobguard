import { NextResponse } from "next/server";
import { dunningFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
import { dunningApplication } from "../../../../lib/dunning-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const credentials = { ...await identityCredentials(request),
      origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    return NextResponse.json(await dunningApplication().read(credentials, (await params).id), { headers });
  } catch (error) {
    const failure = dunningFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
