import "server-only";
import { NextResponse } from "next/server";
import { workOrderHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../lib/workspace-server";
import { isTrustedBrowserOrigin } from "../origin";
const headers = { "cache-control": "no-store" };
function failure(error: unknown) { const { status, body } = workOrderHttpFailure(error); return NextResponse.json(body, { status, headers }); }
/** Office register: import batches, orders and the selectable generated files. */
export async function GET() {
  try { return NextResponse.json(await (await workspaceApplication()).workOrders.overview(), { headers }); } catch (error) { return failure(error); }
}
/** Imports a generated synthetic file (work-order-import.v1). Arbitrary uploads are refused in synthetic_demo (Q8). */
export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ version: "work-order-error.v1", code: "NOT_FOUND", recoverable: false }, { status: 404, headers });
  try {
    const body: unknown = await request.json().catch(() => undefined);
    return NextResponse.json(await (await workspaceApplication()).workOrders.importGenerated(body), { headers });
  } catch (error) { return failure(error); }
}
