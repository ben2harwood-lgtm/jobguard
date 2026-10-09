import "server-only";
import { NextResponse } from "next/server";
import { workOrderHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
/** Read-only (GET) projection: assignments come from the work-order import; there is no office scheduling command. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await (await workspaceApplication()).scheduling.assignments(id), { headers });
  } catch (error) { const { status, body } = workOrderHttpFailure(error); return NextResponse.json(body, { status, headers }); }
}
