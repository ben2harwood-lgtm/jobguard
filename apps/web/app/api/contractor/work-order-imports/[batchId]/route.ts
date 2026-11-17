import "server-only";
import { NextResponse } from "next/server";
import { workOrderHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    return NextResponse.json(await (await workspaceApplication()).workOrders.batch(batchId), { headers });
  } catch (error) { const { status, body } = workOrderHttpFailure(error); return NextResponse.json(body, { status, headers }); }
}
