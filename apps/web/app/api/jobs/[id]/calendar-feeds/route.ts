import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../contractor/origin";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function reply(request: Request, id: string, write: boolean) {
  if (write && !isTrustedBrowserOrigin(request)) return NextResponse.json({ code: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
  try {
    const app = (await workspaceApplication()).calendarFeeds;
    return NextResponse.json(write ? await app.command(id, await request.json()) : await app.list(id), { headers });
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) { denied.headers.set("Cache-Control", "no-store"); return denied; }
    const code = error instanceof Error && "code" in error ? String(error.code) : "CALENDAR_FEED_UNAVAILABLE";
    const status = code === "CALENDAR_FEED_VERSION_CONFLICT" || code === "CALENDAR_FEED_COMMAND_CONFLICT" || code === "CALENDAR_FEED_EXISTS" ? 409
      : code === "CALENDAR_FEED_EDITOR_REQUIRED" ? 403 : code === "CALENDAR_FEED_NOT_FOUND" ? 404
      : code === "CALENDAR_FEED_INVALID" || error instanceof SyntaxError ? 400 : 503;
    return NextResponse.json({ code: status === 503 ? "CALENDAR_FEED_UNAVAILABLE" : code }, { status, headers });
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return reply(request, (await params).id, false);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return reply(request, (await params).id, true);
}
