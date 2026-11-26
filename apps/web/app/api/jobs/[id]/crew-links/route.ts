import { NextResponse } from "next/server";
import { CrewLinkError } from "@jobguard/api/workspace";
import { isTrustedBrowserOrigin } from "../../../contractor/origin";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";

// V2-F7M: the builder's crew links. Gated like the brief-progress route.
const headers = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const denied = practiceFailure(error);
  if (denied) return denied;
  if (error instanceof CrewLinkError) {
    const status = error.code === "CREW_LINK_INVALID_COMMAND" ? 400 : error.code === "CREW_LINK_EDITOR_REQUIRED" ? 403
      : error.code === "CREW_LINK_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ code: error.code }, { status, headers });
  }
  return NextResponse.json({ code: "CREW_LINK_UNAVAILABLE" }, { status: 503, headers });
}
export async function GET(_request: Request, { params }: RouteContext) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers });
  try { return NextResponse.json(await (await workspaceApplication()).crewLinks.read((await params).id), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: RouteContext) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers });
  if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ code: "ORIGIN_REFUSED" }, { status: 403, headers });
  const body: unknown = await request.json().catch(() => null);
  try { return NextResponse.json(await (await workspaceApplication()).crewLinks.command((await params).id, body), { headers }); }
  catch (error) { return failure(error); }
}
