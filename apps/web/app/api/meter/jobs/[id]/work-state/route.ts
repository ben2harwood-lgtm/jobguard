import { WatchdogError } from "@jobguard/db";
import { NextResponse } from "next/server";
import { jobWorkStateFailure, meterTodayFailure } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../../lib/identity-server";
import { meterWorkApplication } from "../../../../../lib/meter-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ code: "INVALID_WORK_STATE_INPUT" }, { status: 400, headers }); }
  try {
    const credentials = { ...await identityCredentials(request),
      origin: request.headers.get("origin") ?? identityApplication().allowedOrigin };
    return NextResponse.json(await meterWorkApplication().command(credentials, (await params).id, raw), { status: 201, headers });
  } catch (error) {
    if (error instanceof WatchdogError) return NextResponse.json({ code: error.code },
      { status: error.code === "JOB_NOT_FOUND" ? 404 : 409, headers });
    const failure = jobWorkStateFailure(error) ?? meterTodayFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
