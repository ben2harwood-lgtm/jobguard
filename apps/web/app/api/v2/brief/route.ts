import { NextResponse } from "next/server";
import { crewLinkHeaders, crewLinkMode, crewLinkOrigin, crewLinkPageFailure, linkCrewBriefs } from "../../../lib/v2-crew-link-server";

// V2-F7M: a crew press by link. The token travels in the body, never the path of the write.
export async function POST(request: Request) {
  if (!crewLinkMode()) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: crewLinkHeaders });
  if (!crewLinkOrigin(request)) return NextResponse.json({ code: "ORIGIN_REFUSED" }, { status: 403, headers: crewLinkHeaders });
  const body: unknown = await request.json().catch(() => null);
  try { return NextResponse.json(await linkCrewBriefs().receive(body), { headers: crewLinkHeaders }); }
  catch (error) { return crewLinkPageFailure(error); }
}
