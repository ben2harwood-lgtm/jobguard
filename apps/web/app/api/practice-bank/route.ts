import { NextResponse } from "next/server";
import { practiceBankFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../lib/identity-server";
import { practiceBankApplication } from "../../lib/practice-bank-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try {
    const credentials = { ...await identityCredentials(request), origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    return NextResponse.json(await practiceBankApplication().read(credentials), { headers });
  } catch (error) {
    const failure = practiceBankFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: Request) {
  try {
    const credentials = { ...await identityCredentials(request), origin: request.headers.get("origin") ?? undefined };
    return NextResponse.json(await practiceBankApplication().command(credentials, await request.json().catch(() => null)), { headers });
  } catch (error) {
    const failure = practiceBankFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
