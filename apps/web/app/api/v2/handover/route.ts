import { NextResponse } from "next/server";
import { handoverLinkFailure, handoverLinkHeaders, handoverLinkMode, handoverLinkOrigin, linkHandover } from "../../../lib/v2-handover-link-server";

// V2-G3: "Acknowledge receipt" by link. The token travels in the body, never the path of the write.
export async function POST(request: Request) {
  if (!handoverLinkMode()) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: handoverLinkHeaders });
  if (!handoverLinkOrigin(request)) return NextResponse.json({ code: "ORIGIN_REFUSED" }, { status: 403, headers: handoverLinkHeaders });
  const body: unknown = await request.json().catch(() => null);
  try { return NextResponse.json(await linkHandover().acknowledge(body), { headers: handoverLinkHeaders }); }
  catch (error) { return handoverLinkFailure(error); }
}
