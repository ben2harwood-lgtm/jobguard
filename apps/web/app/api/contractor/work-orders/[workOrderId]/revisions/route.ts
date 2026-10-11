import "server-only";
import { NextResponse } from "next/server";
import { workOrderHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
/** Immutable revisions with diffs and stable line identities. The resident contact is never part of this response. */
export async function GET(_request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const { workOrderId } = await context.params;
    return NextResponse.json(await (await workspaceApplication()).workOrders.revisions(workOrderId), { headers });
  } catch (error) { const { status, body } = workOrderHttpFailure(error); return NextResponse.json(body, { status, headers }); }
}
