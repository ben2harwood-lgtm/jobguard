import { NextResponse } from "next/server";
import { dunningFailure } from "@jobguard/api/workspace";
import { DunningError } from "@jobguard/core";
import { identityCredentials } from "../../../../../lib/identity-server";
import { dunningApplication } from "../../../../../lib/dunning-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request, { params }: { params: Promise<{ id: string; operation: string }> }) {
  try {
    const { id, operation } = await params;
    if (operation !== "request" && operation !== "approve") throw new DunningError("INVALID_DUNNING_INPUT");
    const raw: unknown = await request.json().catch(() => null);
    return NextResponse.json(await dunningApplication().command(await identityCredentials(request), id, operation, raw), { status: 201, headers });
  } catch (error) {
    const failure = dunningFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
