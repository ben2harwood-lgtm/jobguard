import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../contractor/origin";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function reply(request: Request, id: string, write: boolean) {
  if (write && !isTrustedBrowserOrigin(request)) return NextResponse.json({ code: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
  try {
    const app = (await workspaceApplication()).hires;
    return NextResponse.json(write ? await app.command(id, await request.json()) : await app.list(id), { headers });
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) { denied.headers.set("Cache-Control", "no-store"); return denied; }
    const code = error instanceof Error && "code" in error ? String(error.code) : "HIRE_UNAVAILABLE";
    const status = code === "HIRE_VERSION_CONFLICT" || code === "HIRE_COMMAND_CONFLICT" ? 409
      : code === "HIRE_EDITOR_REQUIRED" ? 403 : code === "HIRE_NOT_FOUND" || code === "HIRE_TASK_NOT_FOUND" ? 404
      : code === "HIRE_INVALID" || error instanceof SyntaxError ? 400 : 503;
    return NextResponse.json({ code: status === 503 ? "HIRE_UNAVAILABLE" : code }, { status, headers });
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return reply(request, (await params).id, false);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return reply(request, (await params).id, true);
}
