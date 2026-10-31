import { NextResponse } from "next/server";
import { meterTodayFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../lib/identity-server";
import { meterApplication } from "../../../lib/meter-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try {
    return NextResponse.json(await meterApplication().read({ ...await identityCredentials(request),
      origin: request.headers.get("origin") ?? identityApplication().allowedOrigin }), { headers });
  } catch (error) {
    const failure = meterTodayFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
