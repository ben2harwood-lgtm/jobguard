import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
import { importV3Failure } from "../../../../../../lib/job-import-v3-error";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await (await workspaceApplication()).imports.preview((await context.params).id, await request.json().catch(() => null)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return importV3Failure(error); }
}
