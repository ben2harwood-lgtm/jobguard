import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
import { importV3Failure } from "../../../../../../lib/job-import-v3-error";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await (await workspaceApplication()).imports.source((await context.params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return importV3Failure(error); }
}
